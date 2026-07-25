import type { JSX } from 'react'
import type { CliStatus, CliToolStatus, ThemePreference } from '../../../shared/types'
import type { ResolvedTheme } from '../lib/useTheme'

interface Props {
  theme: ThemePreference
  resolvedTheme: ResolvedTheme
  onThemeChange: (theme: ThemePreference) => void
  status: CliStatus | null
  checking: boolean
  onRecheck: () => void
  onClose: () => void
}

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

function stateLabel(tool: CliToolStatus): string {
  if (!tool.available) return 'Not detected'
  if (tool.id === 'gh') return tool.authenticated ? 'Detected, logged in' : 'Detected, not logged in'
  return 'Detected'
}

function stateClass(tool: CliToolStatus): string {
  if (!tool.available) return 'tool-chip tool-chip-missing'
  if (tool.id === 'gh' && !tool.authenticated) return 'tool-chip tool-chip-warn'
  return 'tool-chip tool-chip-ok'
}

function hintFor(tool: CliToolStatus): string {
  if (tool.id === 'git' && !tool.available) {
    return 'Install git and restart the app. Nothing works without it.'
  }
  if (tool.id === 'gh' && !tool.available) {
    return 'Install gh to load the pull request list. Every other feature works without it.'
  }
  if (tool.id === 'gh' && !tool.authenticated) {
    return 'Run gh auth login in a terminal, then recheck.'
  }
  return ''
}

function ToolCard({ tool }: { tool: CliToolStatus }): JSX.Element {
  const hint = hintFor(tool)
  return (
    <div className="tool-card">
      <div className="tool-card-header">
        <span className="tool-card-name">{tool.label}</span>
        <span className={stateClass(tool)}>{stateLabel(tool)}</span>
        <span className="tool-card-role">{tool.required ? 'Required' : 'Pull requests only'}</span>
      </div>
      <dl>
        <dt>Version</dt>
        <dd>{tool.version || '-'}</dd>
        <dt>Path</dt>
        <dd>{tool.path || '-'}</dd>
      </dl>
      {hint && <p className="tool-card-hint">{hint}</p>}
    </div>
  )
}

export default function SettingsDialog({
  theme,
  resolvedTheme,
  onThemeChange,
  status,
  checking,
  onRecheck,
  onClose
}: Props): JSX.Element {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <span>Settings</span>
          <button onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <section className="modal-section">
          <h3>Appearance</h3>
          <div className="theme-options">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={theme === option.value ? 'theme-option active' : 'theme-option'}
                onClick={() => onThemeChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="theme-note">
            {theme === 'system'
              ? `Following the system setting, currently ${resolvedTheme}.`
              : `Always ${theme}, ignoring the system setting.`}
          </p>
        </section>

        <section className="modal-section">
          <div className="modal-section-header">
            <h3>Command line tools</h3>
            <button onClick={onRecheck} disabled={checking}>
              {checking ? 'Checking...' : 'Recheck'}
            </button>
          </div>
          {status ? (
            <>
              <ToolCard tool={status.git} />
              <ToolCard tool={status.gh} />
            </>
          ) : (
            <p className="placeholder">Detecting command line tools...</p>
          )}
        </section>
      </div>
    </div>
  )
}
