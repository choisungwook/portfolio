export type BranchSelectionMode = 'single' | 'toggle' | 'range' | 'add-range'

export type BranchFocusMove = 'previous' | 'next' | 'first' | 'last'

export function clampMenuCoordinate(pointer: number, viewport: number, menuSize: number): number {
  return Math.max(0, Math.min(pointer, viewport - menuSize))
}

export function nextBranchFocusIndex(
  itemCount: number,
  currentIndex: number,
  move: BranchFocusMove
): number {
  if (itemCount === 0) return -1
  if (move === 'first') return 0
  if (move === 'last') return itemCount - 1
  if (move === 'previous') return Math.max(0, currentIndex - 1)
  return Math.min(itemCount - 1, currentIndex + 1)
}

export function selectBranchNames(
  groupNames: string[],
  selectedNames: string[],
  anchorName: string,
  clickedName: string,
  mode: BranchSelectionMode
): string[] {
  if (mode === 'single') return [clickedName]

  if (mode === 'toggle') {
    return selectedNames.includes(clickedName)
      ? selectedNames.filter((name) => name !== clickedName)
      : [...selectedNames, clickedName]
  }

  const anchorIndex = groupNames.indexOf(anchorName)
  const clickedIndex = groupNames.indexOf(clickedName)
  if (anchorIndex < 0 || clickedIndex < 0) return [clickedName]

  const start = Math.min(anchorIndex, clickedIndex)
  const end = Math.max(anchorIndex, clickedIndex)
  const range = groupNames.slice(start, end + 1)
  if (mode === 'range') return range
  return [...selectedNames, ...range.filter((name) => !selectedNames.includes(name))]
}
