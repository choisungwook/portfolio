import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { RepoEntry } from '../shared/types'

function storeFilePath(): string {
  return path.join(app.getPath('userData'), 'repos.json')
}

export async function loadRepos(): Promise<RepoEntry[]> {
  try {
    const raw = await fs.readFile(storeFilePath(), 'utf-8')
    const parsed = JSON.parse(raw) as RepoEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function saveRepos(repos: RepoEntry[]): Promise<void> {
  await fs.mkdir(path.dirname(storeFilePath()), { recursive: true })
  await fs.writeFile(storeFilePath(), JSON.stringify(repos, null, 2), 'utf-8')
}

export async function addRepo(repoPath: string): Promise<RepoEntry[]> {
  const repos = await loadRepos()
  if (!repos.some((repo) => repo.path === repoPath)) {
    repos.push({ path: repoPath, name: path.basename(repoPath) })
    await saveRepos(repos)
  }
  return repos
}

export async function removeRepo(repoPath: string): Promise<RepoEntry[]> {
  const repos = (await loadRepos()).filter((repo) => repo.path !== repoPath)
  await saveRepos(repos)
  return repos
}
