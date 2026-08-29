import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initializeGitDesktopApi } from './api'
import './styles.css'

initializeGitDesktopApi()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
