import { NavLink } from 'react-router-dom';
import { useTags } from '../hooks/useTags';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: Props) {
  const tags = useTags();

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <nav>
          <NavLink to="/" onClick={onClose} className="nav-item" end>
            📚 All Bookmarks
          </NavLink>
          <NavLink to="/favorites" onClick={onClose} className="nav-item">
            ★ Favorites
          </NavLink>
          <NavLink to="/unread" onClick={onClose} className="nav-item">
            📕 Unread
          </NavLink>
          <NavLink to="/rss" onClick={onClose} className="nav-item">
            📡 RSS Feeds
          </NavLink>
          <NavLink to="/settings" onClick={onClose} className="nav-item">
            ⚙ Settings
          </NavLink>
        </nav>

        {tags.length > 0 && (
          <div className="sidebar-tags">
            <h3>Tags</h3>
            {tags.map((tag) => (
              <NavLink
                key={tag.id}
                to={`/tag/${encodeURIComponent(tag.name)}`}
                onClick={onClose}
                className="nav-item tag-nav"
              >
                <span className="tag-dot" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </NavLink>
            ))}
          </div>
        )}
      </aside>
    </>
  );
}
