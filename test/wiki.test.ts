import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeUnknownTarget,
  parseKnownTargets,
  resetKnownTargetsCache,
  resolveLatestInterface,
  UnknownTargetError
} from "../src/wiki.js";

describe("resolveLatestInterface", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetKnownTargetsCache();
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

  it("fails with known target suggestions on empty expansion output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => ({
        ok: true,
        json: async () =>
          url.searchParams.get("action") === "query"
            ? { query: { pages: [{ revisions: [{ slots: { main: { content: TEMPLATE_SOURCE } } }] }] } }
            : { expandtemplates: { wikitext: "" } }
      }))
    );

    const error = await resolveLatestInterface("forever").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnknownTargetError);
    expect((error as Error).message).toBe(
      'Warcraft Wiki has no interface for target "forever" (got ""). Did you mean "forever-beta"? ' +
        "Known targets: standard, midnight, wow, camelot-beta, forever-beta, vanilla."
    );
  });

  it("still reports unknown targets when the target list cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) =>
        url.searchParams.get("action") === "query"
          ? { ok: false, status: 503 }
          : { ok: true, json: async () => ({ expandtemplates: { wikitext: "not found" } }) }
      )
    );

    await expect(resolveLatestInterface("unknown")).rejects.toThrow(
      'Warcraft Wiki has no interface for target "unknown" (got "not found").'
    );
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

const TEMPLATE_SOURCE = [
  "{{#vardefine:lpi-list|{{#switch:{{#var:lpi-value|}}",
  "\t|standard|midnight|wow|_retail_={{mn-inline}}\\!\\!Midnight\\!\\!12.1.0\\!\\!120100",
  "\t|camelot-beta|forever-beta|_classic_beta_={{forever-inline}}\\!\\!Forever\\!\\!1.60.1\\!\\!16001",
  "\t|vanilla|_classic_era_={{wow-inline}}\\!\\!World of Warcraft Classic\\!\\!1.15.9\\!\\!11509",
  "}}}}",
  "\t|list={{#var:lpi-list|}}",
  "\t|1|5=@info@"
].join("\n");

describe("parseKnownTargets", () => {
  it("reads target keys from the patch info switch rows", () => {
    expect(parseKnownTargets(TEMPLATE_SOURCE)).toEqual([
      "standard",
      "midnight",
      "wow",
      "camelot-beta",
      "forever-beta",
      "vanilla"
    ]);
  });
});

describe("describeUnknownTarget", () => {
  it("suggests the base target for an unknown suffixed target", () => {
    expect(describeUnknownTarget("vanilla-ptr", "", ["vanilla"])).toContain('Did you mean "vanilla"?');
  });
});
