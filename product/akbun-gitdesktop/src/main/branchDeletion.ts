import type { BranchDeletionResult } from '../shared/types'

type DeleteBranch = (name: string, force: boolean) => Promise<void>
type IsBranchMerged = (name: string) => Promise<boolean>

export async function deleteBranchBatch(
  names: string[],
  force: boolean,
  deleteBranch: DeleteBranch,
  isBranchMerged: IsBranchMerged
): Promise<BranchDeletionResult> {
  const result: BranchDeletionResult = { deleted: [], unmerged: [], failed: [] }

  for (const name of names) {
    try {
      await deleteBranch(name, force)
      result.deleted.push(name)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!force) {
        try {
          if (!(await isBranchMerged(name))) {
            result.unmerged.push(name)
            continue
          }
        } catch {
          // Keep the original deletion error because it is the actionable failure.
        }
      }
      result.failed.push({ name, error: message })
    }
  }

  return result
}
