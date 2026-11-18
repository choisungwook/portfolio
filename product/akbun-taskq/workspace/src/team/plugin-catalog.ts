// The official Claude plugin marketplace, shown in the Plugins view as a list to browse. taskq never installs from it:
// to use one, the user clones it and registers the folder. The list is fetched on demand and kept for an hour; offline,
// the view says so instead of showing a stale copy as current.
export const CATALOG_URL = 'https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json'
const TTL_MS = 60 * 60 * 1000

export interface CatalogPlugin {
  name: string
  description: string
  anthropic: boolean      // the plugin lives in Anthropic's own repository (a relative source), not a partner's
  source: string          // where to get it: a git URL, or the path inside the marketplace repository
  homepage: string | null
}

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

let cache: { at: number; plugins: CatalogPlugin[] } | null = null

function sourceOf(source: unknown): { text: string; anthropic: boolean } {
  if (typeof source === 'string') {
    return { text: `https://github.com/anthropics/claude-plugins-official/tree/main/${source.replace(/^\.\//, '')}`, anthropic: true }
  }
  if (source && typeof source === 'object') {
    const s = source as Record<string, unknown>
    const url = String(s.url ?? s.repo ?? '')
    const path = s.path ? ` (${String(s.path)})` : ''
    return { text: `${url}${path}`, anthropic: /github\.com\/anthropics\//.test(url) }
  }
  return { text: '', anthropic: false }
}

export function parseCatalog(data: unknown): CatalogPlugin[] {
  const plugins = (data as { plugins?: unknown[] })?.plugins
  if (!Array.isArray(plugins)) throw new Error('the marketplace file has no plugins list')
  return plugins.flatMap((raw) => {
    const p = raw as Record<string, unknown>
    if (typeof p.name !== 'string') return []
    const source = sourceOf(p.source)
    return [{
      name: p.name,
      description: typeof p.description === 'string' ? p.description.slice(0, 400) : '',
      anthropic: source.anthropic,
      source: source.text,
      homepage: typeof p.homepage === 'string' ? p.homepage : null,
    }]
  })
}

export async function officialCatalog(fetcher: Fetcher = fetch as unknown as Fetcher, now = Date.now()): Promise<{ plugins: CatalogPlugin[]; fetched_at: number }> {
  if (cache && now - cache.at < TTL_MS) return { plugins: cache.plugins, fetched_at: cache.at }
  const res = await fetcher(CATALOG_URL)
  if (!res.ok) throw new Error(`the marketplace answered ${res.status}`)
  const plugins = parseCatalog(await res.json())
  cache = { at: now, plugins }
  return { plugins, fetched_at: now }
}

export function clearCatalogCache(): void {
  cache = null
}
