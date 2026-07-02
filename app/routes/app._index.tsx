import { useEffect, useState, useCallback } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

// ─── Loader: Fetch all shoppable videos ──────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query GetShoppableVideos {
        metaobjects(type: "$app:shoppable_video", first: 50, sortKey: "updated_at", reverse: true) {
          edges {
            node {
              id
              handle
              title: field(key: "title") { jsonValue }
              videoUrl: field(key: "video_url") { jsonValue }
              status: field(key: "status") { jsonValue }
              tags: field(key: "tags") { jsonValue }
            }
          }
        }
      }`
  );

  const json = await response.json();
  const videos = json.data?.metaobjects?.edges?.map((edge: any) => ({
    id: edge.node.id,
    handle: edge.node.handle,
    title: edge.node.title?.jsonValue || "Untitled",
    videoUrl: edge.node.videoUrl?.jsonValue || "",
    status: edge.node.status?.jsonValue || "draft",
    tags: edge.node.tags?.jsonValue || [],
  })) || [];

  return { videos };
};

// ─── Action: Delete a video ──────────────────────────────────────────────────
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    const videoId = formData.get("videoId") as string;
    await admin.graphql(
      `#graphql
        mutation DeleteVideo($id: ID!) {
          metaobjectDelete(id: $id) {
            deletedId
            userErrors { field message }
          }
        }`,
      { variables: { id: videoId } }
    );
    return { deleted: true };
  }

  return null;
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function VideosIndex() {
  const { videos } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const fetcher = useFetcher();

  const handleDelete = useCallback(
    (videoId: string, title: string) => {
      // Use a simple confirm via App Bridge modal
      if (window.confirm(`Delete "${title}"? This cannot be undone.`)) {
        fetcher.submit(
          { intent: "delete", videoId },
          { method: "POST" }
        );
      }
    },
    [fetcher]
  );

  return (
    <s-page heading="Shoppable Videos">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => navigate("/app/videos/new")}
      >
        + Add Video
      </s-button>

      {videos.length === 0 ? (
        <s-section>
          <s-empty-state heading="No videos yet">
            <s-paragraph>
              Create your first shoppable video to start tagging products.
            </s-paragraph>
            <s-button onClick={() => navigate("/app/videos/new")}>
              Create video
            </s-button>
          </s-empty-state>
        </s-section>
      ) : (
        <s-section>
          <s-resource-list>
            {videos.map((video: any) => {
              const tagCount = Array.isArray(video.tags) ? video.tags.length : 0;
              return (
                <s-resource-item key={video.id} onClick={() => navigate(`/app/videos/${encodeURIComponent(video.handle)}`)}>
                  <s-stack direction="inline" gap="base" align="center" wrap={false}>
                    <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
                      <s-text fontWeight="bold">{video.title}</s-text>
                      <s-text variant="bodyMd" tone="subdued">
                        {tagCount} product{tagCount !== 1 ? "s" : ""} tagged
                      </s-text>
                    </s-stack>
                    <s-badge tone={video.status === "live" ? "success" : undefined}>
                      {video.status === "live" ? "● Live" : "○ Draft"}
                    </s-badge>
                  </s-stack>
                </s-resource-item>
              );
            })}
          </s-resource-list>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
