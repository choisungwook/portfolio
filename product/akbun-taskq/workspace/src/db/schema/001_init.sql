CREATE TABLE tasks (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0,
  lock_key TEXT, claimed_by TEXT, heartbeat_at INTEGER, session_id TEXT,
  data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX tasks_status ON tasks(status, priority DESC, created_at);
CREATE TABLE deps (
  task_id TEXT NOT NULL, depends_on TEXT NOT NULL, kind TEXT NOT NULL,  -- blocks | discovered_from
  PRIMARY KEY (task_id, depends_on));
CREATE TABLE runs (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, session_id TEXT,
  started_at INTEGER NOT NULL, ended_at INTEGER, outcome TEXT, summary TEXT, stats TEXT);
CREATE INDEX runs_time ON runs(started_at);
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, run_id TEXT,
  ts INTEGER NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL);
CREATE INDEX events_task ON events(task_id, id);
CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, run_id TEXT,
  severity TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL,
  created_at INTEGER NOT NULL, acked_at INTEGER);
CREATE TABLE proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, kind TEXT NOT NULL,  -- memory | skill
  target_path TEXT NOT NULL, diff TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);  -- queue_paused, pause_reason
CREATE VIRTUAL TABLE history_fts USING fts5(task_id UNINDEXED, run_id UNINDEXED, body);
