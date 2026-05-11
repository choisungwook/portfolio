import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';

const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

export function useTags() {
  const tags = useLiveQuery(() => db.tags.orderBy('name').toArray());
  return tags ?? [];
}

export async function addTag(name: string): Promise<number> {
  const colorIndex = (await db.tags.count()) % TAG_COLORS.length;
  return db.tags.add({
    name: name.trim().toLowerCase(),
    color: TAG_COLORS[colorIndex],
    createdAt: new Date(),
  });
}

export async function deleteTag(id: number): Promise<void> {
  const tag = await db.tags.get(id);
  if (!tag) return;

  await db.transaction('rw', [db.tags, db.bookmarks], async () => {
    const bookmarks = await db.bookmarks.where('tags').equals(tag.name).toArray();
    for (const bm of bookmarks) {
      await db.bookmarks.update(bm.id!, {
        tags: bm.tags.filter((t) => t !== tag.name),
        updatedAt: new Date(),
      });
    }
    await db.tags.delete(id);
  });
}

export async function ensureTag(name: string): Promise<void> {
  const existing = await db.tags.where('name').equals(name.trim().toLowerCase()).first();
  if (!existing) {
    await addTag(name);
  }
}
