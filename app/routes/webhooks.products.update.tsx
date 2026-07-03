import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { healTagsForProduct, type ProductTag } from "../lib/product-tags";

/**
 * Webhook: products/update
 *
 * Each product tag denormalizes the product's `productHandle` and `title` so the
 * storefront theme block can resolve the product via Liquid `all_products[handle]`
 * without an API call. That denormalized data drifts when a merchant renames a
 * product or changes its handle — and Shopify fires NO dedicated "handle changed"
 * event, so products/update is the only signal we get.
 *
 * This handler re-syncs the stored handle/title on every affected video. It is the
 * counterpart to products/delete and closes the product-reference failure mode where
 * a handle change silently breaks the storefront hotspot lookup.
 *
 * Idempotent: we only write a metaobject back when a value actually changed, so
 * Shopify's retries (and the high frequency of products/update) cause no churn.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const productId = payload.admin_graphql_api_id as string;
  const newHandle = payload.handle as string | undefined;
  const newTitle = payload.title as string | undefined;

  // Nothing we care about, or the app is already uninstalled (no admin client).
  if (!productId || !admin) {
    return new Response();
  }

  try {
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

    for (const edge of videos) {
      const video = edge.node;
      const tags = video.tags?.jsonValue;

      if (!Array.isArray(tags) || tags.length === 0) continue;

      // Re-sync the denormalized handle/title (pure logic lives in ../lib so it's
      // unit-tested). `changed` keeps this idempotent — we only write on a real diff.
      const { tags: updatedTags, changed } = healTagsForProduct(tags as ProductTag[], {
        productId,
        handle: newHandle,
        title: newTitle,
      });

      if (changed) {
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
                fields: [{ key: "tags", value: JSON.stringify(updatedTags) }],
              },
            },
          }
        );
        console.log(`Re-synced product ${productId} in video ${video.id}`);
      }
    }
  } catch (error) {
    console.error("Error syncing updated product into videos:", error);
  }

  return new Response();
};
