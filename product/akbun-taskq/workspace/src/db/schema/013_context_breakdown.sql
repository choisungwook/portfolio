-- What filled a Claude bot's context at the end of its last turn (system prompt, tools, MCP, memory, skills, messages,
-- free space), as the SDK reports it, for the context panel beside the chat. JSON; NULL until a turn reports it.
ALTER TABLE team_agents ADD COLUMN context_breakdown TEXT;
