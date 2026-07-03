/**
 * Pure domain logic for shoppable-video product tags.
 *
 * These functions are deliberately free of Shopify/Admin-API and React concerns so
 * they can be unit-tested in isolation and shared between the admin route and the
 * webhook handlers (single source of truth for the tag rules).
 */

export interface ProductTag {
  productId: string;
  productHandle: string;
  title: string;
  imageUrl?: string;
  timestamp: number; // seconds into the video
  positionX: number; // 0–100 %
  positionY: number; // 0–100 %
}

/** Turn a human title into a URL-safe metaobject handle. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .substring(0, 100);
}

/**
 * Keep only the products that aren't already tagged on this video (dedupe by the
 * stable productId). Used when the resource picker returns a selection.
 */
export function filterNewProducts<T extends { productId: string }>(
  existing: ReadonlyArray<{ productId: string }>,
  incoming: ReadonlyArray<T>,
): T[] {
  const seen = new Set(existing.map((t) => t.productId));
  return incoming.filter((p) => !seen.has(p.productId));
}

/**
 * Re-sync a renamed product's denormalized handle/title across one video's tags.
 *
 * Returns the (possibly) updated tag array and whether anything actually changed.
 * The `changed` flag is what makes the products/update webhook idempotent — the
 * caller only writes the metaobject back when it's true, so Shopify's retries and
 * the naturally high frequency of products/update cause no metaobject churn.
 */
export function healTagsForProduct(
  tags: ProductTag[],
  product: { productId: string; handle?: string; title?: string },
): { tags: ProductTag[]; changed: boolean } {
  let changed = false;
  const updated = tags.map((tag) => {
    if (tag.productId !== product.productId) return tag;
    const next = { ...tag };
    if (product.handle && tag.productHandle !== product.handle) {
      next.productHandle = product.handle;
      changed = true;
    }
    if (product.title && tag.title !== product.title) {
      next.title = product.title;
      changed = true;
    }
    return next;
  });
  return { tags: changed ? updated : tags, changed };
}
