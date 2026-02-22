import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { BookmarkListPage } from './pages/BookmarkListPage';
import { RssFeedPage } from './pages/RssFeedPage';
import { SettingsPage } from './pages/SettingsPage';
import { handleAuthCallback } from './services/google-drive';
import './App.css';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    // Handle Google OAuth callback
    if (window.location.hash.includes('access_token')) {
      handleAuthCallback();
    }
  }, []);

  useEffect(() => {
    // Handle share target (PWA)
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url') || params.get('text');
    if (sharedUrl) {
      sessionStorage.setItem('shared_url', sharedUrl);
      window.history.replaceState(null, '', '/');
    }
  }, []);

  return (
    <BrowserRouter>
      <div className="app">
        <header className="app-header">
          <button className="btn-menu" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
          <h1 className="app-title">Bookmarks</h1>
        </header>

        <div className="app-body">
          <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

          <main className="app-main">
            <Routes>
              <Route path="/" element={<BookmarkListPage />} />
              <Route path="/favorites" element={<BookmarkListPage filter="favorites" />} />
              <Route path="/unread" element={<BookmarkListPage filter="unread" />} />
              <Route path="/tag/:tag" element={<BookmarkListPage />} />
              <Route path="/rss" element={<RssFeedPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
