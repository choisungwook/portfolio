CREATE INDEX runs_task ON runs(task_id);
CREATE INDEX deps_prerequisite ON deps(depends_on);
ALTER TABLE runs ADD COLUMN output_path TEXT;
UPDATE runs SET output_path = (SELECT json_extract(data, '$.output_path') FROM tasks WHERE id = runs.task_id);

CREATE VIEW handoff_inputs AS
SELECT p.id AS source_task_id, t.id AS target_task_id,
  r.id AS run_id, CASE WHEN r.id IS NULL THEN json_extract(p.data, '$.output_path') ELSE r.output_path END AS output_path, r.summary,
  json_extract(t.data, '$.auto_accept_handoffs') IS NOT 0 AS auto_accept
FROM deps d JOIN tasks p ON p.id = d.depends_on JOIN tasks t ON t.id = d.task_id
LEFT JOIN runs r ON r.rowid = (
  SELECT rowid FROM runs WHERE task_id = p.id AND ended_at IS NOT NULL ORDER BY rowid DESC LIMIT 1
) AND r.outcome IN ('done', 'review')
WHERE d.kind = 'blocks' AND p.status = 'done';

CREATE TABLE handoffs (
  id INTEGER PRIMARY KEY,
  source_task_id TEXT NOT NULL,
  target_task_id TEXT NOT NULL,
  run_id TEXT,
  output_path TEXT,
  summary TEXT,
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  accepted_via TEXT CHECK (accepted_via IN ('auto', 'manual')),
  notification_processed_at INTEGER,
  CHECK ((accepted_at IS NULL) = (accepted_via IS NULL))
);
CREATE UNIQUE INDEX handoffs_generation ON handoffs(target_task_id, source_task_id, coalesce(run_id, ''));
CREATE INDEX handoffs_source ON handoffs(source_task_id);
CREATE INDEX handoffs_notifications ON handoffs(id) WHERE notification_processed_at IS NULL;

CREATE VIEW current_handoffs AS
SELECT h.* FROM handoffs h JOIN handoff_inputs i
ON h.source_task_id = i.source_task_id AND h.target_task_id = i.target_task_id AND h.run_id IS i.run_id;

INSERT INTO handoffs (source_task_id, target_task_id, run_id, output_path, summary, created_at,
  accepted_at, accepted_via, notification_processed_at)
SELECT source_task_id, target_task_id, run_id, output_path, summary, unixepoch(),
  CASE WHEN auto_accept THEN unixepoch() END, CASE WHEN auto_accept THEN 'auto' END, unixepoch()
FROM handoff_inputs;

CREATE TRIGGER handoff_source_done AFTER UPDATE OF status ON tasks
WHEN NEW.status = 'done' AND OLD.status != 'done'
BEGIN
  INSERT OR IGNORE INTO handoffs (source_task_id, target_task_id, run_id, output_path, summary, created_at, accepted_at, accepted_via)
  SELECT source_task_id, target_task_id, run_id, output_path, summary, unixepoch(),
    CASE WHEN auto_accept THEN unixepoch() END, CASE WHEN auto_accept THEN 'auto' END
  FROM handoff_inputs WHERE source_task_id = NEW.id;
END;

CREATE TRIGGER handoff_dependency_added AFTER INSERT ON deps
WHEN NEW.kind = 'blocks'
BEGIN
  INSERT OR IGNORE INTO handoffs (source_task_id, target_task_id, run_id, output_path, summary, created_at, accepted_at, accepted_via)
  SELECT source_task_id, target_task_id, run_id, output_path, summary, unixepoch(),
    CASE WHEN auto_accept THEN unixepoch() END, CASE WHEN auto_accept THEN 'auto' END
  FROM handoff_inputs WHERE source_task_id = NEW.depends_on AND target_task_id = NEW.task_id;
END;

CREATE TRIGGER handoff_notice AFTER INSERT ON handoffs
BEGIN
  UPDATE alerts SET acked_at = NEW.created_at
  WHERE task_id = NEW.target_task_id AND kind = 'handoff_received' AND acked_at IS NULL
    AND ref IN (
      SELECT CAST(id AS TEXT) FROM handoffs
      WHERE target_task_id = NEW.target_task_id AND source_task_id = NEW.source_task_id
        AND id != NEW.id AND accepted_at IS NULL
    );
  INSERT INTO alerts (task_id, run_id, severity, kind, message, created_at, ref)
  VALUES (NEW.target_task_id, NEW.run_id, 'normal', 'handoff_received',
    'Handoff #' || NEW.id || ' from ' || NEW.source_task_id ||
    CASE WHEN NEW.accepted_via = 'auto' THEN ' was accepted automatically.' ELSE ' is waiting for acceptance.' END,
    NEW.created_at, CAST(NEW.id AS TEXT));
  INSERT INTO events (task_id, run_id, ts, kind, payload)
  VALUES (NEW.target_task_id, NULL, NEW.created_at, 'handoff_received',
    json_object('handoff_id', NEW.id, 'source_task_id', NEW.source_task_id, 'accepted_via', NEW.accepted_via));
END;
