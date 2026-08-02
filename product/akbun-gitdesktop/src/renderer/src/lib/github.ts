/** Helpers shared by the panels that read GitHub through the gh CLI. */

import type { IssueInfo } from '../../../shared/types'

/** One row of the issue tree: the issue plus where it sits in the hierarchy. */
export interface IssueTreeRow {
  issue: IssueInfo
  depth: number
  /** Last child of its parent, which is what decides the corner of the connector. */
  isLast: boolean
  /**
   * One entry per level above this row's connector, true where an ancestor still
   * has siblings below. That is where the vertical rail keeps going.
   */
  guides: boolean[]
  childCount: number
  /** Parent that exists on GitHub but fell outside the loaded list. 0 otherwise. */
  detachedParent: number
}

/**
 * Lays the issues out as a tree of sub-issues, parents before their children.
 *
 * An issue whose parent is not in the list stays at the top level, because the
 * list is a window over the newest issues and a parent can fall outside it.
 */
export function buildIssueTree(issues: IssueInfo[]): IssueTreeRow[] {
  const byNumber = new Map(issues.map((issue) => [issue.number, issue]))
  const children = new Map<number, IssueInfo[]>()
  const roots: IssueInfo[] = []

  for (const issue of issues) {
    const parent = byNumber.has(issue.parent) ? issue.parent : 0
    if (parent === 0) {
      roots.push(issue)
      continue
    }
    const siblings = children.get(parent) ?? []
    siblings.push(issue)
    children.set(parent, siblings)
  }

  const rows: IssueTreeRow[] = []
  // A parent chain that loops back on itself would recurse forever otherwise.
  const visited = new Set<number>()

  const walk = (issue: IssueInfo, depth: number, isLast: boolean, guides: boolean[]): void => {
    if (visited.has(issue.number)) return
    visited.add(issue.number)
    const kids = children.get(issue.number) ?? []
    rows.push({
      issue,
      depth,
      isLast,
      guides,
      childCount: kids.length,
      detachedParent: depth === 0 && issue.parent !== 0 ? issue.parent : 0
    })
    const kidGuides = depth === 0 ? [] : [...guides, !isLast]
    kids.forEach((kid, index) => walk(kid, depth + 1, index === kids.length - 1, kidGuides))
  }

  roots.forEach((root, index) => walk(root, 0, index === roots.length - 1, []))
  // A parent chain that loops has no root, and no issue may go missing from the
  // list because of it, so whatever the walk did not reach starts its own tree.
  for (const issue of issues) {
    if (!visited.has(issue.number)) walk(issue, 0, true, [])
  }
  return rows
}

/**
 * Turns a gh failure into a message that says what to do about it.
 * Almost every gh failure in this app is a missing install, a missing login or
 * a missing token scope, and the raw stderr says none of that.
 */
export function ghErrorMessage(what: string, error: string, hint = ''): string {
  const lines = [
    `Could not load ${what}. Check that gh is installed and that gh auth login has been run.`
  ]
  if (hint) lines.push(hint)
  lines.push(error)
  return lines.join('\n')
}

/** Projects live behind a token scope that gh auth login does not ask for. */
export const PROJECT_SCOPE_HINT =
  'Projects also need the project scope. Run: gh auth refresh -s read:project'

/** OPEN, CLOSED, MERGED and DRAFT each get their own colour. */
export function stateClass(state: string): string {
  return `pr-state pr-state-${state.toLowerCase()}`
}

/** GitHub timestamps are ISO strings, and the date alone is enough in a list. */
export function shortDate(timestamp: string): string {
  return timestamp.slice(0, 10)
}
