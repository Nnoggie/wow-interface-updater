import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type ResolveTarget = (target: string) => Promise<string>;

export interface TocChange {
  filePath: string;
  lineNumber: number;
  targets: string[];
  oldInterface: string;
  newInterface: string;
}

export interface TocTextUpdate {
  text: string;
  changes: Omit<TocChange, "filePath">[];
}

export interface TocFileUpdatePlan {
  filePath: string;
  text: string;
  changes: TocChange[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectNewline(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function splitLines(text: string): { lines: string[]; finalNewline: boolean } {
  const normalized = text.replace(/\r\n/g, "\n");
  const finalNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");

  if (finalNewline) {
    lines.pop();
  }

  return { lines, finalNewline };
}

function joinLines(lines: string[], newline: string, finalNewline: boolean): string {
  return `${lines.join(newline)}${finalNewline ? newline : ""}`;
}

function parseTargets(rawTargets: string, lineNumber: number): string[] {
  const targets = rawTargets
    .split(",")
    .map((target) => target.trim())
    .filter(Boolean);

  if (targets.length === 0) {
    throw new Error(`Line ${lineNumber}: marker does not declare any targets.`);
  }

  return targets;
}

function parseInterfaceLine(line: string): { values: string; replace: (values: string) => string } | null {
  const match = /^(.*?##\s*Interface\s*:\s*)([\d,\s]+)(.*)$/.exec(line);

  if (!match) {
    return null;
  }

  const [, prefix = "", values = "", suffix = ""] = match;

  return {
    values,
    replace: (nextValues: string) => `${prefix}${nextValues}${suffix}`
  };
}

function formatInterfaceValues(values: string[]): string {
  const sorted = [...new Set(values)].sort((left, right) => Number(right) - Number(left));
  return sorted.join(", ");
}

function toReportPath(filePath: string): string {
  const relativePath = path.relative(process.cwd(), filePath);
  const reportPath =
    relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)
      ? relativePath
      : filePath;

  return reportPath.split(path.sep).join("/");
}

function inlineCode(value: string): string {
  return value.includes("`") ? `\`\` ${value} \`\`` : `\`${value}\``;
}

export async function updateTocText(
  text: string,
  marker: string,
  resolveTarget: ResolveTarget
): Promise<TocTextUpdate> {
  const newline = detectNewline(text);
  const { lines, finalNewline } = splitLines(text);
  const markerPrefix = "(?:#|//)";
  const markerRegex = new RegExp(`^${markerPrefix}\\s*${escapeRegExp(marker)}\\s*:\\s*(.*)$`);
  const malformedMarkerRegex = new RegExp(`^${markerPrefix}\\s*${escapeRegExp(marker)}\\b`);
  const changes: Omit<TocChange, "filePath">[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const markerMatch = markerRegex.exec(line);

    if (!markerMatch) {
      if (malformedMarkerRegex.test(line)) {
        throw new Error(
          `Line ${index + 1}: marker must use "# ${marker}: target, target" or "// ${marker}: target, target" syntax.`
        );
      }

      continue;
    }

    const lineNumber = index + 1;
    const interfaceIndex = index + 1;
    const interfaceLine = lines[interfaceIndex];
    const parsedInterfaceLine =
      interfaceLine === undefined ? null : parseInterfaceLine(interfaceLine);

    if (interfaceLine === undefined || !parsedInterfaceLine) {
      throw new Error(
        `Line ${lineNumber}: marker must be immediately followed by a "## Interface:" line.`
      );
    }

    const targets = parseTargets(markerMatch[1] ?? "", lineNumber);
    const resolvedValues = [];

    for (const target of targets) {
      const value = await resolveTarget(target);

      if (!/^\d+$/.test(value)) {
        throw new Error(`Target "${target}" resolved to a non-numeric interface: "${value}"`);
      }

      resolvedValues.push(value);
    }

    const newInterface = parsedInterfaceLine.replace(formatInterfaceValues(resolvedValues));

    if (interfaceLine !== newInterface) {
      lines[interfaceIndex] = newInterface;
      changes.push({
        lineNumber: interfaceIndex + 1,
        targets,
        oldInterface: interfaceLine,
        newInterface
      });
    }
  }

  return {
    text: changes.length > 0 ? joinLines(lines, newline, finalNewline) : text,
    changes
  };
}

export async function updateTocFile(
  filePath: string,
  marker: string,
  resolveTarget: ResolveTarget
): Promise<TocChange[]> {
  const plan = await planTocFileUpdate(filePath, marker, resolveTarget);

  if (!plan) {
    return [];
  }

  await writeTocFileUpdate(plan);

  return plan.changes;
}

export async function planTocFileUpdate(
  filePath: string,
  marker: string,
  resolveTarget: ResolveTarget
): Promise<TocFileUpdatePlan | null> {
  const original = await readFile(filePath, "utf8");
  const hasBom = original.startsWith("\uFEFF");
  const text = hasBom ? original.slice(1) : original;
  const updated = await updateTocText(text, marker, resolveTarget);

  if (updated.changes.length === 0) {
    return null;
  }

  return {
    filePath,
    text: hasBom ? `\uFEFF${updated.text}` : updated.text,
    changes: updated.changes.map((change) => ({
      filePath: toReportPath(filePath),
      ...change
    }))
  };
}

export async function writeTocFileUpdate(plan: TocFileUpdatePlan): Promise<void> {
  await writeFile(plan.filePath, plan.text, "utf8");
}

export function buildPullRequestBody(changes: TocChange[]): string {
  const lines = [
    "Updates WoW TOC interface versions from Warcraft Wiki.",
    "",
    "Source: https://warcraft.wiki.gg/wiki/Template:API_LatestInterface",
    "",
    "Updated files:",
    ""
  ];

  for (const change of changes) {
    lines.push(`- ${inlineCode(change.filePath)} line ${change.lineNumber}`);
    lines.push(`  - Targets: ${inlineCode(change.targets.join(", "))}`);
    lines.push(`  - Old: ${inlineCode(change.oldInterface)}`);
    lines.push(`  - New: ${inlineCode(change.newInterface)}`);
  }

  return lines.join("\n");
}
