import { useState } from 'react';
import { addBookmark } from '../hooks/useBookmarks';
import { ensureTag } from '../hooks/useTags';

interface Props {
  initialUrl?: string;
  onClose: () => void;
}

export function AddBookmarkForm({ initialUrl = '', onClose }: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleFetchMeta = async () => {
    if (!url) return;
    setLoading(true);
    try {
      // Try fetching page title via a simple proxy-free approach
      const res = await fetch(url);
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const descMatch = html.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
      );
      if (titleMatch) setTitle(titleMatch[1].trim());
      if (descMatch) setDescription(descMatch[1].trim());
    } catch {
      // CORS will block most sites; user can manually enter title
      if (!title) setTitle(url);
    }
    setLoading(false);
  };

  const handleAddTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    for (const tag of tags) {
      await ensureTag(tag);
    }

    await addBookmark({
      url,
      title: title || url,
      description: description || undefined,
      tags,
      isRead: false,
      isFavorite: false,
    });

    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="add-bookmark-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Add Bookmark</h2>

        <div className="form-group">
          <label>URL</label>
          <div className="url-input-row">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
            />
            <button type="button" onClick={handleFetchMeta} disabled={loading || !url}>
              {loading ? '...' : 'Fetch'}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Page title"
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={2}
          />
        </div>

        <div className="form-group">
          <label>Tags</label>
          <div className="tag-input-row">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="Add tag..."
            />
            <button type="button" onClick={handleAddTag}>+</button>
          </div>
          <div className="tags-list">
            {tags.map((tag) => (
              <span key={tag} className="tag" onClick={() => handleRemoveTag(tag)}>
                {tag} ×
              </span>
            ))}
          </div>
        </div>

        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" className="btn-primary">Save</button>
        </div>
      </form>
    </div>
  );
}
