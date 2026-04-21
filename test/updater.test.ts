import { describe, expect, it } from "vitest";
import { buildPullRequestBody, updateTocText } from "../src/updater.js";

const values: Record<string, string> = {
  "mainline-beta": "120001",
  "mainline-test": "120005",
  mainline: "120001",
  mists: "50503",
  vanilla: "11508"
};

async function resolveTarget(target: string): Promise<string> {
  const value = values[target];

  if (!value) {
    throw new Error(`Unknown target: ${target}`);
  }

  return value;
}

describe("updateTocText", () => {
  it("updates the MDT example with unique descending interface values", async () => {
    const input = [
      "# WOW_INTERFACE_TARGETS: mainline-beta, mainline-test, mainline, mists",
      "## Interface: 120001, 120000, 50503",
      "## Title: Mythic Dungeon Tools",
      ""
    ].join("\n");

    const result = await updateTocText(input, "WOW_INTERFACE_TARGETS", resolveTarget);

    expect(result.text).toBe(
      [
        "# WOW_INTERFACE_TARGETS: mainline-beta, mainline-test, mainline, mists",
        "## Interface: 120005, 120001, 50503",
        "## Title: Mythic Dungeon Tools",
        ""
      ].join("\n")
    );
    expect(result.changes).toHaveLength(1);
  });

  it("keeps files without markers unchanged", async () => {
    const input = "## Interface: 120001\n## Title: No Marker\n";
    const result = await updateTocText(input, "WOW_INTERFACE_TARGETS", resolveTarget);

    expect(result.text).toBe(input);
    expect(result.changes).toEqual([]);
  });

  it("preserves CRLF newlines when updating", async () => {
    const input = [
      "# WOW_INTERFACE_TARGETS: mainline-test, mainline",
      "## Interface: 120001",
      "## Title: CRLF",
      ""
    ].join("\r\n");

    const result = await updateTocText(input, "WOW_INTERFACE_TARGETS", resolveTarget);

    expect(result.text).toContain("\r\n");
    expect(result.text).not.toContain("## Interface: 120001\r\n");
    expect(result.text).toContain("## Interface: 120005, 120001\r\n");
  });

  it("accepts whitespace around target names", async () => {
    const input = "# WOW_INTERFACE_TARGETS:  mainline-test , mists  \n## Interface: 1\n";
    const result = await updateTocText(input, "WOW_INTERFACE_TARGETS", resolveTarget);

    expect(result.text).toBe(
      "# WOW_INTERFACE_TARGETS:  mainline-test , mists  \n## Interface: 120005, 50503\n"
    );
  });

  it("updates JavaScript TOC template exports with slash markers", async () => {
    const input = [
      "// WOW_INTERFACE_TARGETS: mainline-test, mainline",
      "export default `## Interface: 120001, 120000",
      "## Title: Wago App Companion",
      "`;",
      ""
    ].join("\n");

    const result = await updateTocText(input, "WOW_INTERFACE_TARGETS", resolveTarget);

    expect(result.text).toBe(
      [
        "// WOW_INTERFACE_TARGETS: mainline-test, mainline",
        "export default `## Interface: 120005, 120001",
        "## Title: Wago App Companion",
        "`;",
        ""
      ].join("\n")
    );
  });

  it("preserves same-line JavaScript template suffixes", async () => {
    const input = "// WOW_INTERFACE_TARGETS: vanilla\nexport default `## Interface: 1`;\n";
    const result = await updateTocText(input, "WOW_INTERFACE_TARGETS", resolveTarget);

    expect(result.text).toBe(
      "// WOW_INTERFACE_TARGETS: vanilla\nexport default `## Interface: 11508`;\n"
    );
  });

  it("fails when a marker is not followed by an interface line", async () => {
    await expect(
      updateTocText(
        "# WOW_INTERFACE_TARGETS: mainline-test\n## Title: Missing Interface\n",
        "WOW_INTERFACE_TARGETS",
        resolveTarget
      )
    ).rejects.toThrow('must be immediately followed by a "## Interface:" line');
  });

  it("fails when a marker has no targets", async () => {
    await expect(
      updateTocText("# WOW_INTERFACE_TARGETS:\n## Interface: 1\n", "WOW_INTERFACE_TARGETS", resolveTarget)
    ).rejects.toThrow("marker does not declare any targets");
  });

  it("fails when a marker is malformed", async () => {
    await expect(
      updateTocText(
        "# WOW_INTERFACE_TARGETS mainline-test\n## Interface: 1\n",
        "WOW_INTERFACE_TARGETS",
        resolveTarget
      )
    ).rejects.toThrow('marker must use "# WOW_INTERFACE_TARGETS: target, target"');
  });

  it("fails when a slash marker is malformed", async () => {
    await expect(
      updateTocText(
        "// WOW_INTERFACE_TARGETS mainline-test\nexport default `## Interface: 1\n",
        "WOW_INTERFACE_TARGETS",
        resolveTarget
      )
    ).rejects.toThrow('"// WOW_INTERFACE_TARGETS: target, target" syntax');
  });

  it("fails when a target resolves to a non-numeric value", async () => {
    await expect(
      updateTocText(
        "# WOW_INTERFACE_TARGETS: mainline-test\n## Interface: 1\n",
        "WOW_INTERFACE_TARGETS",
        async () => "not numeric"
      )
    ).rejects.toThrow("resolved to a non-numeric interface");
  });

  it("propagates unknown target failures", async () => {
    await expect(
      updateTocText(
        "# WOW_INTERFACE_TARGETS: unknown\n## Interface: 1\n",
        "WOW_INTERFACE_TARGETS",
        resolveTarget
      )
    ).rejects.toThrow("Unknown target: unknown");
  });
});

describe("buildPullRequestBody", () => {
  it("summarizes changed files", () => {
    const body = buildPullRequestBody([
      {
        filePath: "MyAddon.toc",
        lineNumber: 2,
        targets: ["mainline-test", "mainline"],
        oldInterface: "## Interface: 120001",
        newInterface: "## Interface: 120005, 120001"
      }
    ]);

    expect(body).toContain("Warcraft Wiki");
    expect(body).toContain("`MyAddon.toc` line 2");
    expect(body).toContain("`## Interface: 120005, 120001`");
  });

  it("summarizes JavaScript interface lines without breaking inline code", () => {
    const body = buildPullRequestBody([
      {
        filePath: "WagoAppCompanion-Mainline.toc.js",
        lineNumber: 2,
        targets: ["mainline-test", "mainline"],
        oldInterface: "export default `## Interface: 120001, 120000",
        newInterface: "export default `## Interface: 120005, 120001"
      }
    ]);

    expect(body).toContain("`` export default `## Interface: 120001, 120000 ``");
    expect(body).toContain("`` export default `## Interface: 120005, 120001 ``");
  });
});
