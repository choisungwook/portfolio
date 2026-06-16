export interface Bookmark {
  id?: number;
  url: string;
  title: string;
  description?: string;
  favicon?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  isRead: boolean;
  isFavorite: boolean;
}

export interface Tag {
  id?: number;
  name: string;
  color: string;
  createdAt: Date;
}

export interface RssFeed {
  id?: number;
  url: string;
  title: string;
  description?: string;
  lastFetchedAt?: Date;
  createdAt: Date;
}

export interface RssItem {
  id?: number;
  feedId: number;
  url: string;
  title: string;
  description?: string;
  publishedAt?: Date;
  isRead: boolean;
  isSaved: boolean;
}

export interface Highlight {
  id?: number;
  bookmarkId: number;
  text: string;
  note?: string;
  color: string;
  createdAt: Date;
}

export interface SyncMeta {
  id?: number;
  key: string;
  value: string;
  updatedAt: Date;
}
