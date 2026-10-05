import * as core from "@actions/core";
import * as glob from "@actions/glob";
import {
  buildPullRequestBody,
  planTocFileUpdate,
  type ResolveTarget,
  writeTocFileUpdate
} from "./updater.js";
import { resolveLatestInterface } from "./wiki.js";

const DEFAULT_FILE_GLOB = ["**/*.toc", "**/*.toc.js", "**/*.ps1", "**/*.php"].join("\n");

function createCachedResolver(): { resolveTarget: ResolveTarget; resolvedCount: () => number } {
  const cache = new Map<string, Promise<string>>();
  const resolved = new Set<string>();

  return {
    resolveTarget: async (target: string) => {
      if (!cache.has(target)) {
        cache.set(target, resolveLatestInterface(target));
      }

      const value = await cache.get(target)!;
      resolved.add(target);
      return value;
    },
    resolvedCount: () => resolved.size
  };
}

async function run(): Promise<void> {
  const tocGlob = core.getInput("toc-glob") || DEFAULT_FILE_GLOB;
  const marker = core.getInput("marker") || "WOW_INTERFACE_TARGETS";
  const globber = await glob.create(tocGlob, {
    followSymbolicLinks: false
  });
  const files = await globber.glob();
  const { resolveTarget, resolvedCount } = createCachedResolver();
  const plans = [];

  for (const file of files) {
    const plan = await planTocFileUpdate(file, marker, resolveTarget);

    if (plan) {
      plans.push(plan);
    }
  }

  const changes = plans.flatMap((plan) => plan.changes);
  const warnings = plans.flatMap((plan) => plan.warnings);

  for (const warning of warnings) {
    core.warning(warning.message, { file: warning.filePath, startLine: warning.lineNumber });
  }

  if (warnings.length > 0 && resolvedCount() === 0) {
    // Nothing resolved at all usually means the wiki template changed, not that every marker is wrong.
    throw new Error(
      `No WoW interface targets could be resolved. ${warnings
        .map((warning) => `${warning.filePath}:${warning.lineNumber}: ${warning.message}`)
        .join(" ")}`
    );
  }

  for (const plan of plans) {
    await writeTocFileUpdate(plan);
  }

  const updatedFiles = [...new Set(changes.map((change) => change.filePath))];
  const changed = changes.length > 0;

  core.setOutput("changed", changed ? "true" : "false");
  core.setOutput("updated-files", updatedFiles.join(","));
  core.setOutput(
    "pr-body",
    changed
      ? buildPullRequestBody(changes, warnings)
      : "All WoW TOC interface versions are already up to date."
  );

  if (changed) {
    core.info(`Updated ${changes.length} interface line(s) in ${updatedFiles.length} file(s).`);
  } else {
    core.info("No TOC interface updates needed.");
  }
}

await run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
