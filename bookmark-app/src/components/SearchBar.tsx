import { useState, useEffect } from 'react';

interface Props {
  onSearch: (query: string) => void;
  initialQuery?: string;
}

export function SearchBar({ onSearch, initialQuery = '' }: Props) {
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    const timer = setTimeout(() => onSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, onSearch]);

  return (
    <div className="search-bar">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search bookmarks..."
        className="search-input"
      />
      {query && (
        <button className="search-clear" onClick={() => setQuery('')}>
          ×
        </button>
      )}
    </div>
  );
}
