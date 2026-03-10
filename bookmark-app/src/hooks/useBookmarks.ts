import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { Bookmark } from '../types/bookmark';

export function useBookmarks(options?: {
  tag?: string;
  search?: string;
  favoritesOnly?: boolean;
  unreadOnly?: boolean;
}) {
  const bookmarks = useLiveQuery(async () => {
    let collection = db.bookmarks.orderBy('createdAt');

    let results = await collection.reverse().toArray();

    if (options?.tag) {
      results = results.filter((b) => b.tags.includes(options.tag!));
    }

    if (options?.search) {
      const q = options.search.toLowerCase();
      results = results.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.url.toLowerCase().includes(q) ||
          b.description?.toLowerCase().includes(q) ||
          b.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (options?.favoritesOnly) {
      results = results.filter((b) => b.isFavorite);
    }

    if (options?.unreadOnly) {
      results = results.filter((b) => !b.isRead);
    }

    return results;
  }, [options?.tag, options?.search, options?.favoritesOnly, options?.unreadOnly]);

  return bookmarks ?? [];
}

export async function addBookmark(data: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
  const now = new Date();
  return db.bookmarks.add({
    ...data,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateBookmark(id: number, changes: Partial<Bookmark>): Promise<void> {
  await db.bookmarks.update(id, { ...changes, updatedAt: new Date() });
}

export async function deleteBookmark(id: number): Promise<void> {
  await db.transaction('rw', [db.bookmarks, db.highlights], async () => {
    await db.highlights.where('bookmarkId').equals(id).delete();
    await db.bookmarks.delete(id);
  });
}

export async function toggleFavorite(id: number): Promise<void> {
  const bookmark = await db.bookmarks.get(id);
  if (bookmark) {
    await db.bookmarks.update(id, { isFavorite: !bookmark.isFavorite, updatedAt: new Date() });
  }
}

export async function toggleRead(id: number): Promise<void> {
  const bookmark = await db.bookmarks.get(id);
  if (bookmark) {
    await db.bookmarks.update(id, { isRead: !bookmark.isRead, updatedAt: new Date() });
  }
}
