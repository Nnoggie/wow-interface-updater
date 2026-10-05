const WIKI_API_URL = "https://warcraft.wiki.gg/api.php";
const PATCH_INFO_TEMPLATE = "Template:LatestPatchInfo";
const USER_AGENT = "wow-interface-updater/0.1";
const TARGET_ALIASES: Record<string, string> = {
  mainline: "standard",
  "mainline-test": "standard-test",
  "mainline-beta": "standard-beta",
  classic: "mists",
  "classic-china": "mists",
  "classic-test": "mists-test",
  "classic-beta": "mists-beta"
};

let knownTargetsPromise: Promise<string[]> | undefined;

export class UnknownTargetError extends Error {
  readonly target: string;

  constructor(target: string, message: string) {
    super(message);
    this.name = "UnknownTargetError";
    this.target = target;
  }
}

export function parseKnownTargets(templateSource: string): string[] {
  const targets = new Set<string>();

  // Each patch row in the template's #switch looks like "|key|key=...\!\!Expansion\!\!...".
  for (const match of templateSource.matchAll(/^\s*\|([\w|-]+)=.*\\!\\!/gm)) {
    for (const target of (match[1] ?? "").split("|")) {
      // Client folder keys like _retail_ are wiki-internal and not useful to suggest.
      if (target && !/^_.*_$/.test(target)) {
        targets.add(target);
      }
    }
  }

  return [...targets];
}

async function fetchKnownTargets(): Promise<string[]> {
  const url = new URL(WIKI_API_URL);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("prop", "revisions");
  url.searchParams.set("rvprop", "content");
  url.searchParams.set("rvslots", "main");
  url.searchParams.set("titles", PATCH_INFO_TEMPLATE);

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT
    }
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    query?: {
      pages?: { revisions?: { slots?: { main?: { content?: unknown } } }[] }[];
    };
  };

  return parseKnownTargets(String(payload.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content ?? ""));
}

function getKnownTargets(): Promise<string[]> {
  knownTargetsPromise ??= fetchKnownTargets().catch(() => []);
  return knownTargetsPromise;
}

export function resetKnownTargetsCache(): void {
  knownTargetsPromise = undefined;
}

export function describeUnknownTarget(target: string, value: string, knownTargets: string[]): string {
  const parts = [`Warcraft Wiki has no interface for target "${target}" (got "${value}").`];
  const suggestions = knownTargets.filter(
    (known) => known.startsWith(`${target}-`) || target.startsWith(`${known}-`)
  );

  if (suggestions.length > 0) {
    parts.push(`Did you mean ${suggestions.map((suggestion) => `"${suggestion}"`).join(" or ")}?`);
  }

  if (knownTargets.length > 0) {
    parts.push(`Known targets: ${knownTargets.join(", ")}.`);
  }

  return parts.join(" ");
}

export async function resolveLatestInterface(target: string): Promise<string> {
  const wikiTarget = TARGET_ALIASES[target] ?? target;
  const url = new URL(WIKI_API_URL);
  url.searchParams.set("action", "expandtemplates");
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "wikitext");
  url.searchParams.set("text", `{{API LatestInterface|${wikiTarget}}}`);

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Warcraft Wiki request failed for "${target}": HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    expandtemplates?: {
      wikitext?: unknown;
    };
  };
  const value = String(payload.expandtemplates?.wikitext ?? "").trim();

  if (!/^\d+$/.test(value)) {
    throw new UnknownTargetError(target, describeUnknownTarget(target, value, await getKnownTargets()));
  }

  return value;
}
