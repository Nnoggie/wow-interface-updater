import * as core from "@actions/core";
import * as glob from "@actions/glob";
import {
  buildPullRequestBody,
  planTocFileUpdate,
  type ResolveTarget,
  writeTocFileUpdate
} from "./updater.js";
import { resolveLatestInterface } from "./wiki.js";

function createCachedResolver(): ResolveTarget {
  const cache = new Map<string, Promise<string>>();

  return async (target: string) => {
    if (!cache.has(target)) {
      cache.set(target, resolveLatestInterface(target));
    }

    return cache.get(target)!;
  };
}

async function run(): Promise<void> {
  const tocGlob = core.getInput("toc-glob") || "**/*.toc";
  const marker = core.getInput("marker") || "WOW_INTERFACE_TARGETS";
  const globber = await glob.create(tocGlob, {
    followSymbolicLinks: false
  });
  const files = await globber.glob();
  const resolveTarget = createCachedResolver();
  const plans = [];

  for (const file of files) {
    const plan = await planTocFileUpdate(file, marker, resolveTarget);

    if (plan) {
      plans.push(plan);
    }
  }

  for (const plan of plans) {
    await writeTocFileUpdate(plan);
  }

  const changes = plans.flatMap((plan) => plan.changes);
  const updatedFiles = [...new Set(changes.map((change) => change.filePath))];
  const changed = changes.length > 0;

  core.setOutput("changed", changed ? "true" : "false");
  core.setOutput("updated-files", updatedFiles.join(","));
  core.setOutput(
    "pr-body",
    changed
      ? buildPullRequestBody(changes)
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
