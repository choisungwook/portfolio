import { useEffect, useRef, useState, type JSX } from 'react'
import type { CliStatus, CliToolStatus } from '../../../shared/types'

interface Props {
  status: CliStatus | null
  onImportRepo: () => void
  onOpenSettings: () => void
  onRecheckCli: () => void
  onCheckForUpdates: () => void
}

type MenuName = 'repository' | 'settings'

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

export default function TopBar({
  status,
  onImportRepo,
  onOpenSettings,
  onRecheckCli,
  onCheckForUpdates
}: Props): JSX.Element {
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null)
  const menuRef = useRef<HTMLElement>(null)
  const notice = status ? noticeFor(status) : ''
  const blocking = status ? !status.git.available : false

  useEffect(() => {
    const closeOutside = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setOpenMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const toggleMenu = (menu: MenuName): void => {
    setOpenMenu((current) => (current === menu ? null : menu))
  }

  const run = (action: () => void): void => {
    setOpenMenu(null)
    action()
  }

  return (
    <>
      <header className="top-bar">
        <span className="top-bar-title">akbun-gitdesktop</span>
        <nav className="app-menus" ref={menuRef} aria-label="Application menu">
          <div className="app-menu">
            <button
              className={openMenu === 'repository' ? 'menu-title open' : 'menu-title'}
              aria-expanded={openMenu === 'repository'}
              onClick={() => toggleMenu('repository')}
            >
              Repository
            </button>
            {openMenu === 'repository' && (
              <div className="menu-list" role="menu">
                <button role="menuitem" onClick={() => run(onImportRepo)}>
                  Import Repository…
                </button>
              </div>
            )}
          </div>
          <div className="app-menu">
            <button
              className={openMenu === 'settings' ? 'menu-title open' : 'menu-title'}
              aria-expanded={openMenu === 'settings'}
              onClick={() => toggleMenu('settings')}
            >
              Settings
            </button>
            {openMenu === 'settings' && (
              <div className="menu-list" role="menu">
                <button role="menuitem" onClick={() => run(onOpenSettings)}>
                  Preferences…
                </button>
                <button role="menuitem" onClick={() => run(onRecheckCli)}>
                  Recheck Command Line Tools
                </button>
                <div className="menu-separator" role="separator" />
                <button role="menuitem" onClick={() => run(onCheckForUpdates)}>
                  Check for Updates…
                </button>
              </div>
            )}
          </div>
        </nav>
        <span className="top-bar-spacer" />
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
      </header>
      {notice && <div className={blocking ? 'notice-bar notice-warn' : 'notice-bar'}>{notice}</div>}
    </>
  )
}
