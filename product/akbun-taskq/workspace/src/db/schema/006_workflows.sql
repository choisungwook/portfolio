-- Workflows: a named graph of steps that a bot executes, like an n8n workflow run by an agent. A run copies the
-- definition (snapshot), so deleting or editing the workflow never changes a run that already started; the deleted
-- workflow is kept with deleted_at so the history can say it is gone.
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  definition TEXT NOT NULL,              -- JSON { steps: [{ id, name, kind, instructions, needs, to? }] }
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE UNIQUE INDEX workflows_live_name ON workflows(name) WHERE deleted_at IS NULL;

CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id),
  snapshot TEXT NOT NULL,                -- the definition as it was when the run started
  task_id TEXT REFERENCES tasks(id),
  bot TEXT NOT NULL,                     -- the bot that executes the run
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
  summary TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE INDEX workflow_runs_started ON workflow_runs(started_at DESC);
CREATE INDEX workflow_runs_bot ON workflow_runs(bot, status);

CREATE TABLE workflow_steps (
  run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  step_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  output TEXT,
  evidence TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  PRIMARY KEY (run_id, step_id)
);
