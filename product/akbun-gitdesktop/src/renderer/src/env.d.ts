/// <reference types="vite/client" />

import type { GitDesktopApi } from './api'

declare global {
  interface Window {
    gitdesktop: GitDesktopApi
  }
}
