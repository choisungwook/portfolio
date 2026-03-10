import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useBookmarks } from '../hooks/useBookmarks';
import { BookmarkCard } from '../components/BookmarkCard';
import { SearchBar } from '../components/SearchBar';
import { AddBookmarkForm } from '../components/AddBookmarkForm';

interface Props {
  filter?: 'favorites' | 'unread';
}

export function BookmarkListPage({ filter }: Props) {
  const { tag } = useParams<{ tag: string }>();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const bookmarks = useBookmarks({
    tag: tag ? decodeURIComponent(tag) : undefined,
    search: search || undefined,
    favoritesOnly: filter === 'favorites',
    unreadOnly: filter === 'unread',
  });

  const handleSearch = useCallback((q: string) => setSearch(q), []);

  const pageTitle = tag
    ? `#${decodeURIComponent(tag)}`
    : filter === 'favorites'
      ? 'Favorites'
      : filter === 'unread'
        ? 'Unread'
        : 'All Bookmarks';

  return (
    <div className="page">
      <div className="page-header">
        <h1>{pageTitle}</h1>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          + Add
        </button>
      </div>

      <SearchBar onSearch={handleSearch} />

      <div className="bookmark-list">
        {bookmarks.length === 0 ? (
          <div className="empty-state">
            <p>No bookmarks yet</p>
            <button className="btn-primary" onClick={() => setShowAdd(true)}>
              Add your first bookmark
            </button>
          </div>
        ) : (
          bookmarks.map((bm) => <BookmarkCard key={bm.id} bookmark={bm} />)
        )}
      </div>

      {showAdd && <AddBookmarkForm onClose={() => setShowAdd(false)} />}
    </div>
  );
}
