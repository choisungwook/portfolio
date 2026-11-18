CREATE TABLE team_agents (
  name TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  description TEXT NOT NULL,
  instructions TEXT NOT NULL,
  task_types TEXT NOT NULL,
  may_message_user INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  session_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE team_turns (
  id INTEGER PRIMARY KEY,
  agent TEXT NOT NULL,
  session_id TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  outcome TEXT CHECK (outcome IN ('done', 'failed', 'interrupted')),
  error TEXT,
  turns INTEGER,
  cost_usd REAL
);
CREATE INDEX team_turns_agent ON team_turns(agent, id);
CREATE INDEX team_turns_time ON team_turns(started_at);

CREATE TABLE team_messages (
  id INTEGER PRIMARY KEY,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  body TEXT NOT NULL,
  task_id TEXT,
  reply_to INTEGER,
  created_at INTEGER NOT NULL,
  turn_id INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  read_at INTEGER,
  failed_at INTEGER
);
CREATE INDEX team_messages_inbox ON team_messages(recipient, id) WHERE read_at IS NULL AND failed_at IS NULL;
CREATE INDEX team_messages_turn ON team_messages(turn_id);

CREATE TABLE wiki_pages (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  revision INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE wiki_revisions (
  slug TEXT NOT NULL,
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (slug, revision)
);

CREATE VIRTUAL TABLE wiki_fts USING fts5(slug UNINDEXED, title, body);
