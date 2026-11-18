-- Background jobs (wiki export and import): long work that reports progress, can be cancelled, and resumes from its
-- last checkpoint after a cancel, a failure or a restart.
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'cancelled', 'done', 'failed')),
  params TEXT NOT NULL,                  -- JSON
  checkpoint TEXT,                       -- JSON written after each step; a resumed job starts from it
  done INTEGER NOT NULL DEFAULT 0,       -- steps finished
  total INTEGER,                         -- steps in all, once known
  message TEXT,                          -- what it is doing now, for the progress bar
  result TEXT,                           -- JSON, when done
  error TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE INDEX jobs_status ON jobs(status, created_at);
