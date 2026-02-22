import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { RssFeed } from '../types/bookmark';

export function RssFeedPage() {
  const [feedUrl, setFeedUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const feeds = useLiveQuery(() => db.rssFeeds.toArray()) ?? [];
  const items = useLiveQuery(() => db.rssItems.orderBy('publishedAt').reverse().limit(50).toArray()) ?? [];

  const handleAddFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedUrl.trim()) return;

    setLoading(true);
    try {
      await fetchAndParseFeed(feedUrl.trim());
      setFeedUrl('');
    } catch (err) {
      alert(`Failed to add feed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleRefreshAll = async () => {
    setLoading(true);
    for (const feed of feeds) {
      try {
        await fetchAndParseFeed(feed.url, feed.id);
      } catch {
        // Skip failed feeds
      }
    }
    setLoading(false);
  };

  const handleDeleteFeed = async (feed: RssFeed) => {
    if (!confirm(`Delete "${feed.title}"?`)) return;
    await db.transaction('rw', [db.rssFeeds, db.rssItems], async () => {
      await db.rssItems.where('feedId').equals(feed.id!).delete();
      await db.rssFeeds.delete(feed.id!);
    });
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>RSS Feeds</h1>
        <button className="btn-secondary" onClick={handleRefreshAll} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh All'}
        </button>
      </div>

      <form className="rss-add-form" onSubmit={handleAddFeed}>
        <input
          type="url"
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          placeholder="https://example.com/feed.xml"
          required
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          Add Feed
        </button>
      </form>

      {feeds.length > 0 && (
        <div className="feed-list">
          <h2>Subscriptions</h2>
          {feeds.map((feed) => (
            <div key={feed.id} className="feed-item">
              <div>
                <strong>{feed.title}</strong>
                <span className="feed-url">{new URL(feed.url).hostname}</span>
              </div>
              <button className="btn-icon delete" onClick={() => handleDeleteFeed(feed)}>🗑</button>
            </div>
          ))}
        </div>
      )}

      <div className="rss-items">
        <h2>Recent Articles</h2>
        {items.length === 0 ? (
          <div className="empty-state"><p>No articles yet. Add an RSS feed to get started.</p></div>
        ) : (
          items.map((item) => (
            <div key={item.id} className={`rss-article ${item.isRead ? 'read' : ''}`}>
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                {item.title}
              </a>
              {item.description && <p>{item.description}</p>}
              {item.publishedAt && (
                <span className="rss-date">{new Date(item.publishedAt).toLocaleDateString()}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

async function fetchAndParseFeed(url: string, existingFeedId?: number): Promise<void> {
  // Use a CORS proxy for RSS feeds
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error('Failed to fetch feed');

  const text = await res.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'text/xml');

  const isAtom = xml.querySelector('feed') !== null;
  let feedTitle: string;
  let entries: { title: string; url: string; description?: string; publishedAt?: Date }[];

  if (isAtom) {
    feedTitle = xml.querySelector('feed > title')?.textContent ?? url;
    entries = Array.from(xml.querySelectorAll('entry')).map((entry) => ({
      title: entry.querySelector('title')?.textContent ?? 'Untitled',
      url: entry.querySelector('link')?.getAttribute('href') ?? '',
      description: entry.querySelector('summary')?.textContent ?? undefined,
      publishedAt: entry.querySelector('published, updated')?.textContent
        ? new Date(entry.querySelector('published, updated')!.textContent!)
        : undefined,
    }));
  } else {
    feedTitle = xml.querySelector('channel > title')?.textContent ?? url;
    entries = Array.from(xml.querySelectorAll('item')).map((item) => ({
      title: item.querySelector('title')?.textContent ?? 'Untitled',
      url: item.querySelector('link')?.textContent ?? '',
      description: item.querySelector('description')?.textContent ?? undefined,
      publishedAt: item.querySelector('pubDate')?.textContent
        ? new Date(item.querySelector('pubDate')!.textContent!)
        : undefined,
    }));
  }

  const feedId = existingFeedId ?? await db.rssFeeds.add({
    url,
    title: feedTitle,
    lastFetchedAt: new Date(),
    createdAt: new Date(),
  });

  if (existingFeedId) {
    await db.rssFeeds.update(existingFeedId, { lastFetchedAt: new Date() });
  }

  for (const entry of entries) {
    const exists = await db.rssItems.where('url').equals(entry.url).first();
    if (!exists && entry.url) {
      await db.rssItems.add({
        feedId,
        url: entry.url,
        title: entry.title,
        description: entry.description,
        publishedAt: entry.publishedAt,
        isRead: false,
        isSaved: false,
      });
    }
  }
}
