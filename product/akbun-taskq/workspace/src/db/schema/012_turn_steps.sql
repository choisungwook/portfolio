-- The tool calls a bot made during a turn, so its conversation shows what it did between messages.
CREATE TABLE team_turn_steps (
  id INTEGER PRIMARY KEY,
  turn_id INTEGER NOT NULL,
  agent TEXT NOT NULL,
  at INTEGER NOT NULL,
  tool TEXT NOT NULL,
  detail TEXT NOT NULL
);
CREATE INDEX team_turn_steps_agent ON team_turn_steps(agent, id);

-- Bots no longer set their own model-turn limit; every bot uses bots.turnMaxTurns from taskq.config.json.
ALTER TABLE team_agents DROP COLUMN turn_max_turns;
