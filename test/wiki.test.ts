import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveLatestInterface } from "../src/wiki.js";

describe("resolveLatestInterface", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns numeric template expansion output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ expandtemplates: { wikitext: "120005" } })
      }))
    );

    await expect(resolveLatestInterface("mainline-test")).resolves.toBe("120005");
  });

  it("fails on non-numeric expansion output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ expandtemplates: { wikitext: "not found" } })
      }))
    );

    await expect(resolveLatestInterface("unknown")).rejects.toThrow("non-numeric");
  });

  it("fails on unsuccessful wiki responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503
      }))
    );

    await expect(resolveLatestInterface("mainline")).rejects.toThrow("HTTP 503");
  });
});
