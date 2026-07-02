import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Webhook: products/delete
 *
 * When a product is deleted from the store, we need to remove any dangling
 * references to it in our shoppable video tags. This prevents broken hotspots
 * on the storefront.
 *
 * Idempotent: safe to run multiple times for the same product deletion.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const deletedProductId = payload.admin_graphql_api_id as string;
  if (!deletedProductId || !admin) {
    return new Response();
  }

  try {
    // Fetch all shoppable video metaobjects
    const response = await admin.graphql(
      `#graphql
        query GetAllVideos {
          metaobjects(type: "$app:shoppable_video", first: 100) {
            edges {
              node {
                id
                tags: field(key: "tags") { jsonValue }
              }
            }
          }
        }`
    );

    const json = await response.json();
    const videos = json.data?.metaobjects?.edges || [];

    // For each video, remove tags referencing the deleted product
    for (const edge of videos) {
      const video = edge.node;
      const tags = video.tags?.jsonValue;

      if (!Array.isArray(tags) || tags.length === 0) continue;

      const filteredTags = tags.filter(
        (tag: any) => tag.productId !== deletedProductId
      );

      // Only update if we actually removed something
      if (filteredTags.length < tags.length) {
        await admin.graphql(
          `#graphql
            mutation UpdateVideoTags($id: ID!, $metaobject: MetaobjectUpdateInput!) {
              metaobjectUpdate(id: $id, metaobject: $metaobject) {
                userErrors { field message }
              }
            }`,
          {
            variables: {
              id: video.id,
              metaobject: {
                fields: [
                  { key: "tags", value: JSON.stringify(filteredTags) },
                ],
              },
            },
          }
        );
        console.log(
          `Removed deleted product ${deletedProductId} from video ${video.id}`
        );
      }
    }
  } catch (error) {
    console.error("Error cleaning up deleted product from videos:", error);
  }

  return new Response();
};
