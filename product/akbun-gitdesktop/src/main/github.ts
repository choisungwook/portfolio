import { execFile } from 'node:child_process'
import type {
  IssueInfo,
  ProjectBoard,
  ProjectColumn,
  ProjectInfo,
  ProjectItem,
  ProjectListResult,
  PullRequestInfo,
  ThreadComment,
  ThreadDetail
} from '../shared/types'

const LIST_LIMIT = 50
const BOARD_ITEM_LIMIT = 200
const FIELD_LIMIT = 50
/** Column for project items whose Status field is empty. */
const NO_STATUS = 'No status'

const PR_LIST_FIELDS = 'number,title,state,author,headRefName,url,updatedAt,labels'
const PR_DETAIL_FIELDS =
  'number,title,state,author,url,createdAt,updatedAt,labels,assignees,body,comments,baseRefName,headRefName,additions,deletions,changedFiles'
const ISSUE_LIST_FIELDS = 'number,title,state,author,url,updatedAt,labels'
const ISSUE_DETAIL_FIELDS =
  'number,title,state,author,url,createdAt,updatedAt,labels,assignees,body,comments'

function runGh(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { cwd, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message))
        return
      }
      resolve(stdout)
    })
  })
}

interface GhActor {
  login?: string
}

interface GhLabel {
  name?: string
}

interface GhComment {
  author?: GhActor
  createdAt?: string
  body?: string
}

function labelNames(labels: GhLabel[] | undefined): string[] {
  return (labels ?? []).map((label) => label.name ?? '').filter(Boolean)
}

function logins(actors: GhActor[] | undefined): string[] {
  return (actors ?? []).map((actor) => actor.login ?? '').filter(Boolean)
}

function toComments(comments: GhComment[] | undefined): ThreadComment[] {
  return (comments ?? []).map((comment) => ({
    author: comment.author?.login ?? '',
    createdAt: comment.createdAt ?? '',
    body: comment.body ?? ''
  }))
}

/** gh takes a number as a command line argument, so reject anything that is not one. */
function numberArg(value: number): string {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Not a valid number: ${value}`)
  }
  return String(value)
}

interface GhRepo {
  owner?: GhActor
  name?: string
  nameWithOwner?: string
}

async function getRepoIdentity(repoPath: string): Promise<{ owner: string; nameWithOwner: string }> {
  const out = await runGh(repoPath, ['repo', 'view', '--json', 'owner,name,nameWithOwner'])
  const repo = JSON.parse(out) as GhRepo
  return { owner: repo.owner?.login ?? '', nameWithOwner: repo.nameWithOwner ?? '' }
}

interface GhPullRequest {
  number: number
  title: string
  state: string
  author?: GhActor
  headRefName?: string
  url: string
  updatedAt: string
  labels?: GhLabel[]
}

export async function getPullRequests(repoPath: string): Promise<PullRequestInfo[]> {
  const out = await runGh(repoPath, [
    'pr',
    'list',
    '--state',
    'all',
    '--limit',
    String(LIST_LIMIT),
    '--json',
    PR_LIST_FIELDS
  ])
  const rows = JSON.parse(out) as GhPullRequest[]
  return rows.map((row) => ({
    number: row.number,
    title: row.title,
    state: row.state,
    author: row.author?.login ?? '',
    headRefName: row.headRefName ?? '',
    url: row.url,
    updatedAt: row.updatedAt,
    labels: labelNames(row.labels)
  }))
}

interface GhIssue {
  number: number
  title: string
  state: string
  author?: GhActor
  url: string
  updatedAt: string
  labels?: GhLabel[]
}

export async function getIssues(repoPath: string): Promise<IssueInfo[]> {
  const out = await runGh(repoPath, [
    'issue',
    'list',
    '--state',
    'all',
    '--limit',
    String(LIST_LIMIT),
    '--json',
    ISSUE_LIST_FIELDS
  ])
  const rows = JSON.parse(out) as GhIssue[]
  return rows.map((row) => ({
    number: row.number,
    title: row.title,
    state: row.state,
    author: row.author?.login ?? '',
    url: row.url,
    updatedAt: row.updatedAt,
    labels: labelNames(row.labels)
  }))
}

interface GhThread {
  number: number
  title: string
  state: string
  author?: GhActor
  url: string
  createdAt: string
  updatedAt: string
  labels?: GhLabel[]
  assignees?: GhActor[]
  body?: string
  comments?: GhComment[]
  baseRefName?: string
  headRefName?: string
  additions?: number
  deletions?: number
  changedFiles?: number
}

function toThreadDetail(kind: ThreadDetail['kind'], raw: GhThread): ThreadDetail {
  return {
    kind,
    number: raw.number,
    title: raw.title,
    state: raw.state,
    author: raw.author?.login ?? '',
    url: raw.url,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    labels: labelNames(raw.labels),
    assignees: logins(raw.assignees),
    body: raw.body ?? '',
    comments: toComments(raw.comments),
    baseRefName: raw.baseRefName ?? '',
    headRefName: raw.headRefName ?? '',
    additions: raw.additions ?? 0,
    deletions: raw.deletions ?? 0,
    changedFiles: raw.changedFiles ?? 0
  }
}

export async function getPullRequestDetail(repoPath: string, number: number): Promise<ThreadDetail> {
  const out = await runGh(repoPath, ['pr', 'view', numberArg(number), '--json', PR_DETAIL_FIELDS])
  return toThreadDetail('pr', JSON.parse(out) as GhThread)
}

export async function getIssueDetail(repoPath: string, number: number): Promise<ThreadDetail> {
  const out = await runGh(repoPath, ['issue', 'view', numberArg(number), '--json', ISSUE_DETAIL_FIELDS])
  return toThreadDetail('issue', JSON.parse(out) as GhThread)
}

interface GhProject {
  number: number
  title?: string
  url?: string
  closed?: boolean
  items?: { totalCount?: number }
}

/**
 * Lists the projects of the owner of this repository.
 * A project belongs to a user or an organization rather than to a repository,
 * so the owner is resolved first and returned for the board lookup that follows.
 */
export async function getProjects(repoPath: string): Promise<ProjectListResult> {
  const identity = await getRepoIdentity(repoPath)
  const out = await runGh(repoPath, [
    'project',
    'list',
    '--owner',
    identity.owner,
    '--limit',
    String(LIST_LIMIT),
    '--format',
    'json'
  ])
  const parsed = JSON.parse(out) as { projects?: GhProject[] }
  const projects: ProjectInfo[] = (parsed.projects ?? []).map((project) => ({
    number: project.number,
    title: project.title ?? '',
    url: project.url ?? '',
    closed: project.closed ?? false,
    itemCount: project.items?.totalCount ?? 0
  }))
  return { owner: identity.owner, nameWithOwner: identity.nameWithOwner, projects }
}

/**
 * One row of gh project item-list.
 * The item carries its content plus one key per project field, so a single
 * select field named Status arrives as a plain string under `status`.
 */
interface GhProjectItem {
  id?: string
  title?: string
  type?: string
  url?: string
  status?: string
  assignees?: string[]
  labels?: string[]
  content?: {
    type?: string
    title?: string
    number?: number
    url?: string
    repository?: string
  }
}

function toProjectItem(raw: GhProjectItem, index: number): ProjectItem {
  const content = raw.content ?? {}
  return {
    id: raw.id || `item-${index}`,
    title: raw.title || content.title || '(untitled)',
    status: raw.status?.trim() || NO_STATUS,
    type: content.type || raw.type || '',
    url: content.url || raw.url || '',
    number: content.number ?? 0,
    repository: content.repository ?? '',
    assignees: raw.assignees ?? [],
    labels: raw.labels ?? []
  }
}

/**
 * Reads the options of the Status field to order the board columns.
 * Only the order comes from here, so a failure is not worth surfacing.
 */
async function readStatusOptions(repoPath: string, owner: string, number: number): Promise<string[]> {
  try {
    const out = await runGh(repoPath, [
      'project',
      'field-list',
      numberArg(number),
      '--owner',
      owner,
      '--limit',
      String(FIELD_LIMIT),
      '--format',
      'json'
    ])
    const parsed = JSON.parse(out) as {
      fields?: Array<{ name?: string; options?: Array<{ name?: string }> }>
    }
    const status = (parsed.fields ?? []).find((field) => field.name?.toLowerCase() === 'status')
    return (status?.options ?? []).map((option) => option.name ?? '').filter(Boolean)
  } catch {
    // The columns then follow the order the items arrive in.
    return []
  }
}

function buildColumns(items: ProjectItem[], statusOrder: string[]): ProjectColumn[] {
  const names = statusOrder.filter((name) => name !== NO_STATUS)
  for (const item of items) {
    if (item.status !== NO_STATUS && !names.includes(item.status)) names.push(item.status)
  }
  // Items without a status are not a real column, so they go last.
  if (items.some((item) => item.status === NO_STATUS)) names.push(NO_STATUS)
  return names.map((name) => ({
    name,
    items: items.filter((item) => item.status === name)
  }))
}

export async function getProjectBoard(
  repoPath: string,
  owner: string,
  number: number
): Promise<ProjectBoard> {
  const out = await runGh(repoPath, [
    'project',
    'item-list',
    numberArg(number),
    '--owner',
    owner,
    '--limit',
    String(BOARD_ITEM_LIMIT),
    '--format',
    'json'
  ])
  const parsed = JSON.parse(out) as { items?: GhProjectItem[] }
  const items = (parsed.items ?? []).map(toProjectItem)
  const statusOrder = await readStatusOptions(repoPath, owner, number)
  return { columns: buildColumns(items, statusOrder) }
}
