-- A bot: one resident Claude session with its own role, permission mode, sandbox and command gate. `system` marks the
-- orchestrator taskq, which cannot be deleted and is listed first.
CREATE TABLE team_agents (
  name TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  description TEXT NOT NULL,
  instructions TEXT NOT NULL,
  may_message_user INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  system INTEGER NOT NULL DEFAULT 0,
  permission_mode TEXT NOT NULL DEFAULT 'auto'
    CHECK (permission_mode IN ('auto', 'acceptEdits', 'default', 'dontAsk', 'plan', 'bypassPermissions')),
  sandbox INTEGER NOT NULL DEFAULT 0,
  allowed_domains TEXT NOT NULL DEFAULT '[]',
  blocked_commands TEXT NOT NULL DEFAULT '[]',
  workdir TEXT,
  skills TEXT NOT NULL DEFAULT '[]',
  plugins TEXT NOT NULL DEFAULT '[]',
  model TEXT,
  sdk TEXT NOT NULL DEFAULT 'claude',
  hourly_turns INTEGER,
  turn_budget_usd REAL,
  turn_max_turns INTEGER,
  memory TEXT NOT NULL DEFAULT '',
  session_id TEXT,
  created_at INTEGER NOT NULL
);

-- Skills and plugins registered once in the global settings; each bot picks which of them it loads.
CREATE TABLE bot_skills (
  name TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE bot_plugins (
  name TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at INTEGER NOT NULL
);

-- A run a bot did in its own session, as opposed to a one-off run started from the task (bot is NULL).
ALTER TABLE runs ADD COLUMN bot TEXT;

CREATE TABLE team_turns (
  id INTEGER PRIMARY KEY,
  agent TEXT NOT NULL,
  session_id TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  outcome TEXT CHECK (outcome IN ('done', 'failed', 'interrupted', 'cancelled')),
  error TEXT,
  turns INTEGER,
  cost_usd REAL,
  writes INTEGER NOT NULL DEFAULT 0
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
  thread_id INTEGER,
  attachments TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  deliver_at INTEGER NOT NULL,
  turn_id INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  read_at INTEGER,
  failed_at INTEGER
);
CREATE INDEX team_messages_inbox ON team_messages(recipient, id) WHERE read_at IS NULL AND failed_at IS NULL;
CREATE INDEX team_messages_turn ON team_messages(turn_id);
CREATE INDEX team_messages_thread ON team_messages(thread_id) WHERE thread_id IS NOT NULL;

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

-- unicode61 splits on spaces only, so a Korean word with a particle ("검색률이") never matches its stem ("검색률").
-- The trigram index matches any substring of three or more characters; shorter terms are matched with LIKE.
CREATE VIRTUAL TABLE wiki_fts USING fts5(slug UNINDEXED, title, body, tokenize = 'trigram');

-- [[slug]] references between pages. Search follows them one hop.
CREATE TABLE wiki_links (
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  PRIMARY KEY (source, target)
);
CREATE INDEX wiki_links_target ON wiki_links(target);

-- One owner per task: the team agent that gets the task's result. NULL is a task the user added and nobody claimed.
ALTER TABLE tasks ADD COLUMN owner TEXT;
-- When the current owner took the task. The bots' budget counts only runs from then on.
ALTER TABLE tasks ADD COLUMN owner_since INTEGER;
CREATE INDEX tasks_owner ON tasks(owner) WHERE owner IS NOT NULL;

-- A bounded discussion: participants speak in a fixed order for a fixed number of rounds, then the moderator concludes.
-- posts counts contributions and passes; the next speaker is participants[posts % count].
CREATE TABLE team_threads (
  id INTEGER PRIMARY KEY,
  topic TEXT NOT NULL,
  moderator TEXT NOT NULL,
  participants TEXT NOT NULL,
  rounds INTEGER NOT NULL,
  posts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'concluding', 'closed')),
  conclusion TEXT,
  wiki_slug TEXT,
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);

-- Search over every bot conversation. Trigram matches any part of a word, so a Korean stem finds a word with a particle;
-- the index is kept by triggers, so every path that writes a message is covered.
CREATE VIRTUAL TABLE team_messages_fts USING fts5(body, tokenize = 'trigram', content = 'team_messages', content_rowid = 'id');
CREATE TRIGGER team_messages_fts_insert AFTER INSERT ON team_messages BEGIN
  INSERT INTO team_messages_fts (rowid, body) VALUES (NEW.id, NEW.body);
END;
CREATE TRIGGER team_messages_fts_delete AFTER DELETE ON team_messages BEGIN
  INSERT INTO team_messages_fts (team_messages_fts, rowid, body) VALUES ('delete', OLD.id, OLD.body);
END;
