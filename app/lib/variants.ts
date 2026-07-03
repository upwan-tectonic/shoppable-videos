/**
 * Variant selection logic for the storefront product card.
 *
 * This is the canonical, unit-tested implementation of how selected option values
 * map to a specific variant. The storefront theme block (shoppable-video-core.liquid)
 * mirrors this same algorithm in plain JS because Liquid can't import TypeScript;
 * keeping the tested reference here guards the algorithm against regressions.
 */

export interface Variant {
  id: string;
  title: string;
  price: string;
  available: boolean;
  options: string[]; // option values in option order, e.g. ["Red", "M"]
}

/**
 * Given a product's variants and the currently selected option values (one per
 * option, in option order), return the matching variant.
 *
 * - No variants → undefined.
 * - No selectors on the card (single-option / default) → the first variant.
 * - Otherwise → the variant whose option values exactly match the selection.
 */
export function matchVariant(
  variants: Variant[],
  selectedOptions: string[],
): Variant | undefined {
  if (!variants || variants.length === 0) return undefined;
  if (selectedOptions.length === 0) return variants[0];
  return variants.find(
    (v) =>
      Array.isArray(v.options) &&
      v.options.length === selectedOptions.length &&
      v.options.every((o, i) => o === selectedOptions[i]),
  );
}

/** Pre-select the first available variant, falling back to the first variant. */
export function firstAvailableVariant(variants: Variant[]): Variant | undefined {
  if (!variants || variants.length === 0) return undefined;
  return variants.find((v) => v.available) || variants[0];
}
