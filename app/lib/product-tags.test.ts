import { describe, it, expect } from "vitest";
import {
  slugify,
  filterNewProducts,
  healTagsForProduct,
  type ProductTag,
} from "./product-tags";

const tag = (over: Partial<ProductTag> = {}): ProductTag => ({
  productId: "gid://shopify/Product/1",
  productHandle: "linen-shirt",
  title: "Linen Shirt",
  timestamp: 0,
  positionX: 50,
  positionY: 50,
  ...over,
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Spring Lookbook 2026")).toBe("spring-lookbook-2026");
  });

  it("collapses non-alphanumerics and trims leading/trailing hyphens", () => {
    expect(slugify("  Hello --- World!!  ")).toBe("hello-world");
  });

  it("caps the handle at 100 characters", () => {
    expect(slugify("a".repeat(200)).length).toBe(100);
  });
});

describe("filterNewProducts", () => {
  it("drops products already tagged (by productId)", () => {
    const existing = [{ productId: "gid://shopify/Product/1" }];
    const incoming = [
      { productId: "gid://shopify/Product/1", handle: "dupe" },
      { productId: "gid://shopify/Product/2", handle: "new" },
    ];
    expect(filterNewProducts(existing, incoming)).toEqual([
      { productId: "gid://shopify/Product/2", handle: "new" },
    ]);
  });

  it("returns all when nothing overlaps", () => {
    expect(filterNewProducts([], [{ productId: "x" }])).toHaveLength(1);
  });
});

describe("healTagsForProduct", () => {
  it("rewrites handle and title for the matching product", () => {
    const result = healTagsForProduct([tag()], {
      productId: "gid://shopify/Product/1",
      handle: "linen-shirt-v2",
      title: "Linen Shirt v2",
    });
    expect(result.changed).toBe(true);
    expect(result.tags[0].productHandle).toBe("linen-shirt-v2");
    expect(result.tags[0].title).toBe("Linen Shirt v2");
  });

  it("is idempotent — no change when values already match", () => {
    const tags = [tag()];
    const result = healTagsForProduct(tags, {
      productId: "gid://shopify/Product/1",
      handle: "linen-shirt",
      title: "Linen Shirt",
    });
    expect(result.changed).toBe(false);
    expect(result.tags).toBe(tags); // same reference → caller skips the write
  });

  it("leaves other products' tags untouched", () => {
    const other = tag({ productId: "gid://shopify/Product/2", productHandle: "hat" });
    const result = healTagsForProduct([tag(), other], {
      productId: "gid://shopify/Product/1",
      handle: "linen-shirt-v2",
    });
    expect(result.changed).toBe(true);
    expect(result.tags[1]).toEqual(other);
  });

  it("preserves timestamp and position when healing", () => {
    const result = healTagsForProduct([tag({ timestamp: 12, positionX: 30, positionY: 70 })], {
      productId: "gid://shopify/Product/1",
      handle: "changed",
    });
    expect(result.tags[0]).toMatchObject({ timestamp: 12, positionX: 30, positionY: 70 });
  });
});
