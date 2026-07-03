import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Resource route backing the "upload video to Shopify" flow (Files API).
 *
 * It returns plain JSON (Response.json) so the embedded admin can drive the
 * three-step handshake with sequential fetches. The browser uploads the video
 * bytes DIRECTLY to Shopify-hosted storage between steps 1 and 2, so large files
 * never pass through this app server.
 *
 *   1. stagedUpload → get a signed upload target (url + form parameters)
 *   2. (browser POSTs the file to that target)
 *   3. createFile   → register the uploaded resource as a Shopify File
 *   4. fileStatus   → poll until READY, then return the CDN url
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // Step 1 — staged upload target.
  if (intent === "stagedUpload") {
    const filename = formData.get("filename") as string;
    const mimeType = (formData.get("mimeType") as string) || "video/mp4";
    const fileSize = formData.get("fileSize") as string;
    const res = await admin.graphql(
      `#graphql
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets { url resourceUrl parameters { name value } }
            userErrors { field message }
          }
        }`,
      {
        variables: {
          input: [
            {
              resource: "FILE",
              filename,
              mimeType,
              httpMethod: "POST",
              ...(fileSize ? { fileSize } : {}),
            },
          ],
        },
      }
    );
    const json = await res.json();
    const result = json.data?.stagedUploadsCreate;
    if (result?.userErrors?.length) {
      return Response.json({ error: result.userErrors.map((e: any) => e.message).join(", ") });
    }
    return Response.json({ stagedTarget: result?.stagedTargets?.[0] ?? null });
  }

  // Step 3 — register the uploaded resource as a File.
  if (intent === "createFile") {
    const resourceUrl = formData.get("resourceUrl") as string;
    const filename = formData.get("filename") as string;
    const res = await admin.graphql(
      `#graphql
        mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files { id fileStatus alt }
            userErrors { field message }
          }
        }`,
      {
        variables: {
          files: [{ originalSource: resourceUrl, contentType: "FILE", alt: filename || "" }],
        },
      }
    );
    const json = await res.json();
    const result = json.data?.fileCreate;
    if (result?.userErrors?.length) {
      return Response.json({ error: result.userErrors.map((e: any) => e.message).join(", ") });
    }
    return Response.json({ fileId: result?.files?.[0]?.id ?? null });
  }

  // Step 4 — poll until READY, return the CDN url.
  if (intent === "fileStatus") {
    const fileId = formData.get("fileId") as string;
    const res = await admin.graphql(
      `#graphql
        query fileStatus($id: ID!) {
          node(id: $id) {
            ... on GenericFile { fileStatus url }
            ... on Video { fileStatus sources { url } }
          }
        }`,
      { variables: { id: fileId } }
    );
    const json = await res.json();
    const node = json.data?.node;
    const url = node?.url || node?.sources?.[0]?.url || null;
    return Response.json({ status: node?.fileStatus ?? "UNKNOWN", url });
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
};
