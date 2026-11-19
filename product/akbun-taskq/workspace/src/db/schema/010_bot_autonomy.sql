-- What a bot may do alone and what waits for the user, work that starts without a message, and goals.
-- A charter (what the bot owns, what good looks like, what it never does without asking) goes into its standing orders.
-- ask_first holds Bash command patterns (or tool:<name pattern>) that wait for the user's approval instead of running.
ALTER TABLE team_agents ADD COLUMN charter_owns TEXT NOT NULL DEFAULT '';
ALTER TABLE team_agents ADD COLUMN charter_good TEXT NOT NULL DEFAULT '';
ALTER TABLE team_agents ADD COLUMN charter_never TEXT NOT NULL DEFAULT '';
ALTER TABLE team_agents ADD COLUMN ask_first TEXT NOT NULL DEFAULT '[]';

-- A bot's call that waits for the user. An approved request lets that exact call run once.
CREATE TABLE bot_approvals (
  id INTEGER PRIMARY KEY,
  bot TEXT NOT NULL,
  tool TEXT NOT NULL,
  command TEXT NOT NULL,
  rule TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'used')),
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  used_at INTEGER
);
CREATE INDEX bot_approvals_open ON bot_approvals(bot, status);

-- A bot stopped at a login wall. Until the user says they signed in, the bot gets no turns.
CREATE TABLE bot_logins (
  id INTEGER PRIMARY KEY,
  bot TEXT NOT NULL,
  what TEXT NOT NULL,
  how TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  done_at INTEGER,
  cancelled INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX bot_logins_open ON bot_logins(bot) WHERE done_at IS NULL;

-- Work a bot does on a schedule (5-field cron, local time) or on an event, delivered as a message.
CREATE TABLE bot_routines (
  id INTEGER PRIMARY KEY,
  bot TEXT NOT NULL,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  schedule TEXT,
  trigger TEXT CHECK (trigger IN ('task_failed', 'task_created', 'webhook')),
  enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at INTEGER,
  last_run_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK ((schedule IS NULL) != (trigger IS NULL))
);
ALTER TABLE team_messages ADD COLUMN routine_id INTEGER;

-- An objective the user hands the bots; the orchestrator splits it and closes it with a summary.
CREATE TABLE goals (
  id INTEGER PRIMARY KEY,
  objective TEXT NOT NULL,
  done_when TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dropped')),
  summary TEXT,
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);
