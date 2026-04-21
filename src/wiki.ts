const WIKI_API_URL = "https://warcraft.wiki.gg/api.php";
const USER_AGENT = "wow-interface-updater/0.1";

export async function resolveLatestInterface(target: string): Promise<string> {
  const url = new URL(WIKI_API_URL);
  url.searchParams.set("action", "expandtemplates");
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "wikitext");
  url.searchParams.set("text", `{{API LatestInterface|${target}}}`);

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
    throw new Error(`Warcraft Wiki returned a non-numeric interface for "${target}": "${value}"`);
  }

  return value;
}
