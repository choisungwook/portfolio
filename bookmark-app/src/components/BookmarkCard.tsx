import type { Bookmark } from '../types/bookmark';
import { toggleFavorite, toggleRead, deleteBookmark } from '../hooks/useBookmarks';

interface Props {
  bookmark: Bookmark;
}

export function BookmarkCard({ bookmark }: Props) {
  const handleDelete = async () => {
    if (confirm('Delete this bookmark?')) {
      await deleteBookmark(bookmark.id!);
    }
  };

  return (
    <div className={`bookmark-card ${bookmark.isRead ? 'read' : ''}`}>
      <div className="bookmark-header">
        {bookmark.favicon && (
          <img src={bookmark.favicon} alt="" className="bookmark-favicon" />
        )}
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          className="bookmark-title"
        >
          {bookmark.title}
        </a>
      </div>

      {bookmark.description && (
        <p className="bookmark-description">{bookmark.description}</p>
      )}

      <div className="bookmark-url">{new URL(bookmark.url).hostname}</div>

      {bookmark.tags.length > 0 && (
        <div className="bookmark-tags">
          {bookmark.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="bookmark-actions">
        <button
          onClick={() => toggleFavorite(bookmark.id!)}
          className={`btn-icon ${bookmark.isFavorite ? 'active' : ''}`}
          title={bookmark.isFavorite ? 'Remove favorite' : 'Add favorite'}
        >
          {bookmark.isFavorite ? '★' : '☆'}
        </button>
        <button
          onClick={() => toggleRead(bookmark.id!)}
          className="btn-icon"
          title={bookmark.isRead ? 'Mark unread' : 'Mark read'}
        >
          {bookmark.isRead ? '📖' : '📕'}
        </button>
        <button onClick={handleDelete} className="btn-icon delete" title="Delete">
          🗑
        </button>
      </div>

      <div className="bookmark-date">
        {bookmark.createdAt.toLocaleDateString()}
      </div>
    </div>
  );
}
