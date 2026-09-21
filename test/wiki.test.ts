import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveLatestInterface } from "../src/wiki.js";

describe("resolveLatestInterface", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["mainline", "standard"],
    ["mainline-test", "standard-test"],
    ["mainline-beta", "standard-beta"],
    ["classic", "mists"],
    ["classic-china", "mists"],
    ["classic-test", "mists-test"],
    ["classic-beta", "mists-beta"]
  ])("resolves the removed %s alias through %s", async (target, wikiTarget) => {
    const fetchMock = vi.fn(async (_url: URL) => ({
      ok: true,
      json: async () => ({ expandtemplates: { wikitext: "120005" } })
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveLatestInterface(target)).resolves.toBe("120005");

    const url = fetchMock.mock.calls[0]?.[0];
    expect(url).toBeInstanceOf(URL);
    expect((url as URL).searchParams.get("text")).toBe(`{{API LatestInterface|${wikiTarget}}}`);
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
