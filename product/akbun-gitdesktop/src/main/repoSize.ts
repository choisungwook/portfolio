import type { RepoSizeInfo } from '../shared/types'
import { directorySize } from './directorySize'
import { getGitDirectoryPath } from './git'
import { loadRepos } from './repoStore'

async function measureRepo(repoPath: string): Promise<RepoSizeInfo> {
  try {
    const gitDirectory = await getGitDirectoryPath(repoPath)
    return { path: repoPath, bytes: await directorySize(gitDirectory) }
  } catch {
    return { path: repoPath, bytes: null }
  }
}

export async function loadRepoSizes(): Promise<RepoSizeInfo[]> {
  const repos = await loadRepos()
  return Promise.all(repos.map((repo) => measureRepo(repo.path)))
}
