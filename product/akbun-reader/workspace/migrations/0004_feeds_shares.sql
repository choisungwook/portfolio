CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  fetch_status TEXT NOT NULL DEFAULT 'pending' CHECK(fetch_status IN ('pending','done','failed')),
  fetched_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE feed_items (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(feed_id, guid)
);
CREATE INDEX feed_items_published ON feed_items(published_at DESC, id);
CREATE INDEX feed_items_feed_published ON feed_items(feed_id, published_at DESC, id);
CREATE TABLE shares (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('tag','feed')),
  target TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(kind, target)
);
