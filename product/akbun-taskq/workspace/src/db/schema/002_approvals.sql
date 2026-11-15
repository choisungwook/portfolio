CREATE TABLE approvals (
  request_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, run_id TEXT NOT NULL, tool TEXT NOT NULL,
  input TEXT, created_at INTEGER NOT NULL, decision TEXT, decided_at INTEGER);  -- decision: approved | denied | expired | NULL (open)
CREATE INDEX approvals_task ON approvals(task_id, decision);
ALTER TABLE alerts ADD COLUMN ref TEXT;  -- approval_required alerts carry their request_id
