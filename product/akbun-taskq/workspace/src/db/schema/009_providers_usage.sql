-- Kiro joins the SDKs a bot can run on, and an OpenAI bot picks how it signs in (provider). SQLite cannot change a CHECK
-- constraint in place, so team_agents is copied into a new table with the wider one.
-- Every turn records its model and tokens for the Usage page, and every bot its last context size for the context ring.
CREATE TABLE team_agents_next (
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
  effort TEXT CHECK (effort IN ('low', 'medium', 'high', 'xhigh', 'max')),
  sdk TEXT NOT NULL DEFAULT 'claude' CHECK (sdk IN ('claude', 'openai', 'kiro')),
  provider TEXT CHECK (provider IN ('api', 'bedrock', 'chatgpt')),  -- OpenAI bots only; NULL is api
  hourly_turns INTEGER,
  turn_budget_usd REAL,
  turn_max_turns INTEGER,
  memory TEXT NOT NULL DEFAULT '',
  session_id TEXT,
  session_cost_usd REAL NOT NULL DEFAULT 0,
  mcp_servers TEXT NOT NULL DEFAULT '[]',
  context_tokens INTEGER,    -- tokens in the context at the end of the last turn
  context_window INTEGER,    -- the model's context window, when the SDK says it
  created_at INTEGER NOT NULL
);
INSERT INTO team_agents_next (name, role, description, instructions, may_message_user, enabled, system, permission_mode, sandbox,
  allowed_domains, blocked_commands, workdir, skills, plugins, model, effort, sdk, hourly_turns, turn_budget_usd, turn_max_turns,
  memory, session_id, session_cost_usd, mcp_servers, created_at)
SELECT name, role, description, instructions, may_message_user, enabled, system, permission_mode, sandbox,
  allowed_domains, blocked_commands, workdir, skills, plugins, model, effort, sdk, hourly_turns, turn_budget_usd, turn_max_turns,
  memory, session_id, session_cost_usd, mcp_servers, created_at FROM team_agents;
DROP TABLE team_agents;
ALTER TABLE team_agents_next RENAME TO team_agents;

ALTER TABLE team_turns ADD COLUMN sdk TEXT;
ALTER TABLE team_turns ADD COLUMN provider TEXT;
ALTER TABLE team_turns ADD COLUMN model TEXT;
ALTER TABLE team_turns ADD COLUMN input_tokens INTEGER;
ALTER TABLE team_turns ADD COLUMN output_tokens INTEGER;
ALTER TABLE team_turns ADD COLUMN cache_read_tokens INTEGER;
ALTER TABLE team_turns ADD COLUMN cache_write_tokens INTEGER;
ALTER TABLE team_turns ADD COLUMN credits REAL;      -- Kiro bills in credits, not dollars
