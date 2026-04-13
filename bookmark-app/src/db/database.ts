import Dexie, { type Table } from 'dexie';
import type { Bookmark, Tag, RssFeed, RssItem, Highlight, SyncMeta } from '../types/bookmark';

export class BookmarkDatabase extends Dexie {
  bookmarks!: Table<Bookmark>;
  tags!: Table<Tag>;
  rssFeeds!: Table<RssFeed>;
  rssItems!: Table<RssItem>;
  highlights!: Table<Highlight>;
  syncMeta!: Table<SyncMeta>;

  constructor() {
    super('BookmarkApp');
    this.version(1).stores({
      bookmarks: '++id, url, title, *tags, createdAt, updatedAt, isRead, isFavorite',
      tags: '++id, &name, createdAt',
      rssFeeds: '++id, &url, title, lastFetchedAt',
      rssItems: '++id, feedId, url, publishedAt, isRead, isSaved',
      highlights: '++id, bookmarkId, createdAt',
      syncMeta: '++id, &key',
    });
  }
}

export const db = new BookmarkDatabase();
