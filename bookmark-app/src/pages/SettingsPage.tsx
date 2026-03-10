import { useState } from 'react';
import {
  initiateGoogleAuth,
  isAuthenticated,
  logout,
  uploadBackup,
  downloadBackup,
} from '../services/google-drive';
import { db } from '../db/database';

export function SettingsPage() {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const authenticated = isAuthenticated();

  const handleUpload = async () => {
    setSyncing(true);
    setMessage('');
    try {
      await uploadBackup();
      setMessage('Backup uploaded to Google Drive');
    } catch (err) {
      setMessage(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setSyncing(false);
  };

  const handleDownload = async () => {
    if (!confirm('This will replace all local data with the cloud backup. Continue?')) return;
    setSyncing(true);
    setMessage('');
    try {
      await downloadBackup();
      setMessage('Data restored from Google Drive');
    } catch (err) {
      setMessage(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setSyncing(false);
  };

  const handleExportJson = async () => {
    const data = {
      bookmarks: await db.bookmarks.toArray(),
      tags: await db.tags.toArray(),
      rssFeeds: await db.rssFeeds.toArray(),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookmarks-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      await db.transaction('rw', [db.bookmarks, db.tags, db.rssFeeds], async () => {
        if (data.bookmarks?.length) {
          for (const bm of data.bookmarks) {
            const exists = await db.bookmarks.where('url').equals(bm.url).first();
            if (!exists) {
              await db.bookmarks.add({
                ...bm,
                id: undefined,
                createdAt: new Date(bm.createdAt),
                updatedAt: new Date(bm.updatedAt),
              });
            }
          }
        }
        if (data.tags?.length) {
          for (const tag of data.tags) {
            const exists = await db.tags.where('name').equals(tag.name).first();
            if (!exists) {
              await db.tags.add({ ...tag, id: undefined, createdAt: new Date(tag.createdAt) });
            }
          }
        }
      });

      setMessage(`Imported ${data.bookmarks?.length ?? 0} bookmarks`);
    } catch {
      setMessage('Import failed: Invalid file format');
    }
  };

  return (
    <div className="page">
      <h1>Settings</h1>

      <section className="settings-section">
        <h2>Google Drive Sync</h2>
        <p className="settings-description">
          Sync your bookmarks across devices using Google Drive.
        </p>

        {authenticated ? (
          <div className="sync-actions">
            <p className="sync-status">Connected to Google Drive</p>
            <button className="btn-primary" onClick={handleUpload} disabled={syncing}>
              {syncing ? 'Syncing...' : 'Upload Backup'}
            </button>
            <button className="btn-secondary" onClick={handleDownload} disabled={syncing}>
              Download & Restore
            </button>
            <button className="btn-danger" onClick={logout}>
              Disconnect
            </button>
          </div>
        ) : (
          <button className="btn-primary" onClick={initiateGoogleAuth}>
            Connect Google Drive
          </button>
        )}

        {message && <p className="settings-message">{message}</p>}
      </section>

      <section className="settings-section">
        <h2>Import / Export</h2>
        <div className="import-export-actions">
          <button className="btn-secondary" onClick={handleExportJson}>
            Export as JSON
          </button>
          <label className="btn-secondary file-label">
            Import JSON
            <input type="file" accept=".json" onChange={handleImportJson} hidden />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h2>About</h2>
        <p>Bookmark App v0.1.0</p>
        <p>Capacitor + React + Dexie.js</p>
        <p>Data stored locally in IndexedDB</p>
      </section>
    </div>
  );
}
