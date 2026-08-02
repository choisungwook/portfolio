/** Helpers shared by the panels that read GitHub through the gh CLI. */

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
