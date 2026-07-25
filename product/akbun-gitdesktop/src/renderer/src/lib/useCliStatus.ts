import { useCallback, useEffect, useState } from 'react'
import type { CliStatus } from '../../../shared/types'

export interface CliStatusState {
  status: CliStatus | null
  checking: boolean
  recheck: () => void
}

/** Detects git and gh once at startup, and again whenever the user asks for a recheck. */
export function useCliStatus(): CliStatusState {
  const [status, setStatus] = useState<CliStatus | null>(null)
  const [checking, setChecking] = useState(true)

  const recheck = useCallback(() => {
    setChecking(true)
    window.gitdesktop.checkCliTools().then((result) => {
      setChecking(false)
      if (result.ok) setStatus(result.data)
    })
  }, [])

  useEffect(() => {
    recheck()
  }, [recheck])

  return { status, checking, recheck }
}
