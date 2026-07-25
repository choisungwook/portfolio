import { useCallback, useEffect, useState } from 'react'
import type { ThemePreference } from '../../../shared/types'

export type ResolvedTheme = 'light' | 'dark'

export interface ThemeState {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (theme: ThemePreference) => void
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * Keeps the document theme in sync with the stored preference.
 * "system" follows the OS setting and reacts while the app is open.
 */
export function useTheme(): ThemeState {
  const [preference, setStoredPreference] = useState<ThemePreference>('system')
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches)

  useEffect(() => {
    window.gitdesktop.getSettings().then((result) => {
      if (result.ok) setStoredPreference(result.data.theme)
    })
  }, [])

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved: ResolvedTheme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = resolved
  }, [resolved])

  const setPreference = useCallback((theme: ThemePreference) => {
    setStoredPreference(theme)
    window.gitdesktop.setTheme(theme)
  }, [])

  return { preference, resolved, setPreference }
}
