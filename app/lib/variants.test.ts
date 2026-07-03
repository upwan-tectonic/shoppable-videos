import { describe, it, expect } from "vitest";
import { matchVariant, firstAvailableVariant, type Variant } from "./variants";

const v = (over: Partial<Variant> = {}): Variant => ({
  id: "gid://shopify/ProductVariant/1",
  title: "Default",
  price: "$10.00",
  available: true,
  options: [],
  ...over,
});

const RED_S = v({ id: "1", options: ["Red", "S"], available: true });
const RED_M = v({ id: "2", options: ["Red", "M"], available: false });
const BLUE_S = v({ id: "3", options: ["Blue", "S"], available: true });

describe("matchVariant", () => {
  it("returns undefined when there are no variants", () => {
    expect(matchVariant([], ["Red"])).toBeUndefined();
  });

  it("returns the first variant when there are no selectors", () => {
    const only = v({ id: "9" });
    expect(matchVariant([only], [])).toBe(only);
  });

  it("matches on an exact ordered option combination", () => {
    expect(matchVariant([RED_S, RED_M, BLUE_S], ["Red", "M"])).toBe(RED_M);
  });

  it("is order-sensitive across options", () => {
    // ["S","Red"] is not the same as ["Red","S"]
    expect(matchVariant([RED_S, BLUE_S], ["S", "Red"])).toBeUndefined();
  });

  it("returns undefined when no combination matches", () => {
    expect(matchVariant([RED_S, BLUE_S], ["Green", "S"])).toBeUndefined();
  });
});

describe("firstAvailableVariant", () => {
  it("prefers the first available variant", () => {
    expect(firstAvailableVariant([RED_M, BLUE_S])).toBe(BLUE_S);
  });

  it("falls back to the first variant when none are available", () => {
    const soldOut = [v({ id: "a", available: false }), v({ id: "b", available: false })];
    expect(firstAvailableVariant(soldOut)).toBe(soldOut[0]);
  });

  it("returns undefined for an empty list", () => {
    expect(firstAvailableVariant([])).toBeUndefined();
  });
});
