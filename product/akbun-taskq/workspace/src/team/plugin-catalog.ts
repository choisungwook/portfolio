// The official Claude plugin marketplace, shown in the Plugins view. Install (plugin-install.ts) fetches one at the
// commit the marketplace lists. The list is fetched on demand and kept for an hour; offline, the view says so instead of
// showing a stale copy as current.
export const CATALOG_URL = 'https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json'
const CATALOG_REPO = 'https://github.com/anthropics/claude-plugins-official.git'

// Where install fetches a plugin: a git repository over https, the folder inside it ('' for the root), and the commit
// (sha) or branch or tag (ref) the marketplace pins. Null when the entry has no source taskq can fetch.
export interface InstallSource {
  url: string
  path: string
  ref: string | null
  sha: string | null
}

// Manifest fields of a marketplace entry. A strict: false entry has no plugin.json of its own; the entry is its manifest.
const MANIFEST_KEYS = ['name', 'description', 'version', 'author', 'homepage', 'keywords', 'skills', 'commands', 'agents', 'hooks', 'mcpServers', 'lspServers']
const TTL_MS = 60 * 60 * 1000

export interface CatalogPlugin {
  name: string
  description: string
  anthropic: boolean      // the plugin lives in Anthropic's own repository (a relative source), not a partner's
  source: string          // where to get it: a git URL, or the path inside the marketplace repository
  homepage: string | null
  install: InstallSource | null
  manifest: Record<string, unknown>  // used only when the fetched folder has no .claude-plugin/plugin.json
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

// The folder inside the repository: no leading ./ or trailing /, and never a step up out of the checkout.
function folderOf(path: string): string | null {
  const clean = path.replace(/^\.\//, '').replace(/\/+$/, '')
  return clean.split('/').some((part) => part === '..' || part === '.') || clean.startsWith('/') ? null : clean
}

// sha and ref go to git as arguments, so only a hex commit id or a plain branch or tag name is accepted.
const SHA = /^[0-9a-f]{7,40}$/
const REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/

export function installSourceOf(source: unknown): InstallSource | null {
  if (typeof source === 'string') {
    const path = folderOf(source)
    return path === null ? null : { url: CATALOG_REPO, path, ref: null, sha: null }
  }
  if (!source || typeof source !== 'object') return null
  const s = source as Record<string, unknown>
  const url = s.source === 'github' && text(s.repo) ? `https://github.com/${text(s.repo)}.git` : text(s.url)
  if (!url || !/^https:\/\/[^\s]+$/.test(url)) return null
  const path = folderOf(text(s.path) ?? '')
  const ref = text(s.ref)
  const sha = text(s.sha)
  if (path === null || (ref !== null && !REF.test(ref)) || (sha !== null && !SHA.test(sha))) return null
  return { url, path, ref, sha }
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
      install: installSourceOf(p.source),
      manifest: Object.fromEntries(MANIFEST_KEYS.filter((key) => key in p).map((key) => [key, p[key]])),
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
