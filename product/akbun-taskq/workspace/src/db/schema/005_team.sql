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
