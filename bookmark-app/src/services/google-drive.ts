import { db } from '../db/database';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const BACKUP_FILENAME = 'bookmark-app-backup.json';

let accessToken: string | null = null;

export async function initiateGoogleAuth(): Promise<void> {
  const redirectUri = `${window.location.origin}/auth/callback`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('prompt', 'consent');

  window.location.href = authUrl.toString();
}

export function handleAuthCallback(): boolean {
  const hash = window.location.hash;
  if (!hash.includes('access_token')) return false;

  const params = new URLSearchParams(hash.substring(1));
  const token = params.get('access_token');
  const expiresIn = params.get('expires_in');

  if (token) {
    accessToken = token;
    const expiresAt = Date.now() + (Number(expiresIn) || 3600) * 1000;
    localStorage.setItem('google_access_token', token);
    localStorage.setItem('google_token_expires_at', String(expiresAt));
    window.history.replaceState(null, '', '/');
    return true;
  }
  return false;
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;

  const token = localStorage.getItem('google_access_token');
  const expiresAt = localStorage.getItem('google_token_expires_at');

  if (token && expiresAt && Date.now() < Number(expiresAt)) {
    accessToken = token;
    return token;
  }

  localStorage.removeItem('google_access_token');
  localStorage.removeItem('google_token_expires_at');
  return null;
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

export function logout(): void {
  accessToken = null;
  localStorage.removeItem('google_access_token');
  localStorage.removeItem('google_token_expires_at');
}

async function findBackupFileId(token: string): Promise<string | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${BACKUP_FILENAME}'&fields=files(id,name,modifiedTime)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

export async function uploadBackup(): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const bookmarks = await db.bookmarks.toArray();
  const tags = await db.tags.toArray();
  const rssFeeds = await db.rssFeeds.toArray();
  const rssItems = await db.rssItems.toArray();
  const highlights = await db.highlights.toArray();

  const backup = JSON.stringify({ bookmarks, tags, rssFeeds, rssItems, highlights, exportedAt: new Date().toISOString() });

  const existingId = await findBackupFileId(token);

  const metadata = {
    name: BACKUP_FILENAME,
    ...(existingId ? {} : { parents: ['appDataFolder'] }),
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([backup], { type: 'application/json' }));

  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const method = existingId ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
}

export async function downloadBackup(): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const fileId = await findBackupFileId(token);
  if (!fileId) throw new Error('No backup found');

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);

  const data = await res.json();

  await db.transaction('rw', [db.bookmarks, db.tags, db.rssFeeds, db.rssItems, db.highlights], async () => {
    await db.bookmarks.clear();
    await db.tags.clear();
    await db.rssFeeds.clear();
    await db.rssItems.clear();
    await db.highlights.clear();

    if (data.bookmarks?.length) await db.bookmarks.bulkAdd(data.bookmarks);
    if (data.tags?.length) await db.tags.bulkAdd(data.tags);
    if (data.rssFeeds?.length) await db.rssFeeds.bulkAdd(data.rssFeeds);
    if (data.rssItems?.length) await db.rssItems.bulkAdd(data.rssItems);
    if (data.highlights?.length) await db.highlights.bulkAdd(data.highlights);
  });
}
