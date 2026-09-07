CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  normalized_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags_json)),
  location TEXT NOT NULL DEFAULT 'inbox' CHECK(location IN ('inbox','later','archive')),
  is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)),
  summary_json TEXT NOT NULL DEFAULT '[]',
  suggested_tags_json TEXT NOT NULL DEFAULT '[]',
  ai_status TEXT NOT NULL DEFAULT 'pending',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX documents_location_created ON documents(location, created_at DESC, id);
CREATE TABLE changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER document_created AFTER INSERT ON documents BEGIN
  INSERT INTO changes(document_id, operation) VALUES (NEW.id, 'create');
END;
CREATE TRIGGER document_updated AFTER UPDATE ON documents BEGIN
  INSERT INTO changes(document_id, operation) VALUES (NEW.id, 'update');
END;
CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at TEXT
);
CREATE TABLE ai_usage (
  month TEXT PRIMARY KEY,
  calls INTEGER NOT NULL DEFAULT 0,
  reserved_won INTEGER NOT NULL DEFAULT 0
);
