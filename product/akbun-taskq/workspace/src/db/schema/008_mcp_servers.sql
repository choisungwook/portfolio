-- MCP servers registered for bots. Both SDKs start them over stdio: Claude bots through the session's mcpServers,
-- OpenAI bots through MCPServerStdio. A bot loads the ones it picks (team_agents.mcp_servers).
CREATE TABLE bot_mcp_servers (
  name TEXT PRIMARY KEY,
  command TEXT NOT NULL,
  args TEXT NOT NULL DEFAULT '[]',       -- JSON array of strings
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
ALTER TABLE team_agents ADD COLUMN mcp_servers TEXT NOT NULL DEFAULT '[]';
