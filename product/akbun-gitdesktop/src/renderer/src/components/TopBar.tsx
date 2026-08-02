import type { JSX } from 'react'
import type { CliStatus, CliToolStatus } from '../../../shared/types'

interface Props {
  status: CliStatus | null
  onOpenSettings: () => void
}

/** Chip class for one tool: missing, degraded (gh without login) or ready. */
function chipClass(tool: CliToolStatus): string {
  if (!tool.available) return 'tool-chip tool-chip-missing'
  if (tool.id === 'gh' && !tool.authenticated) return 'tool-chip tool-chip-warn'
  return 'tool-chip tool-chip-ok'
}

function chipLabel(tool: CliToolStatus): string {
  if (!tool.available) return `${tool.id} missing`
  if (tool.id === 'gh' && !tool.authenticated) return 'gh not logged in'
  return `${tool.id} ready`
}

function noticeFor(status: CliStatus): string {
  if (!status.git.available) {
    return 'git CLI was not found. This app runs git commands directly, so install git to use any feature.'
  }
  if (!status.gh.available) {
    return 'gh CLI was not found. Every feature works except the pull request, issue and project tabs.'
  }
  if (!status.gh.authenticated) {
    return 'gh CLI is installed but not logged in. Run gh auth login to load pull requests, issues and projects.'
  }
  return ''
}

/**
 * Fixed top bar. It shows how the app depends on the two CLIs it shells out to,
 * git for everything and gh for the GitHub tabs, and opens the settings dialog.
 */
export default function TopBar({ status, onOpenSettings }: Props): JSX.Element {
  const notice = status ? noticeFor(status) : ''
  const blocking = status ? !status.git.available : false

  return (
    <>
      <header className="top-bar">
        <span className="top-bar-title">akbun-gitdesktop</span>
        {status && (
          <>
            <span className={chipClass(status.git)} title={status.git.version || 'git CLI not found'}>
              {chipLabel(status.git)}
            </span>
            <span className={chipClass(status.gh)} title={status.gh.version || 'gh CLI not found'}>
              {chipLabel(status.gh)}
            </span>
          </>
        )}
        <span className="top-bar-spacer" />
        <button onClick={onOpenSettings} title="Open settings">
          Settings
        </button>
      </header>
      {notice && <div className={blocking ? 'notice-bar notice-warn' : 'notice-bar'}>{notice}</div>}
    </>
  )
}
