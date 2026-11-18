import type { Db } from './open.ts'
import { nowSec } from '../time.ts'

// MCP servers bots can load, started as a command over stdio. The command runs as the user, outside the bot gate, the
// same way a plugin's MCP server does: registering one is trusting it. Values are not secrets: environment variables
// with keys belong in the user's shell, not here.

export interface McpServerEntry {
  name: string
  command: string
  args: string[]
  description: string
}

const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/

export function addMcpServer(db: Db, entry: McpServerEntry): McpServerEntry {
  if (!NAME.test(entry.name)) throw new Error('name must be lowercase letters, digits and hyphens, up to 40 characters')
  if (entry.name === 'team') throw new Error('team is the name of the bots\' own tool server')
  if (!entry.command.trim() || entry.command.length > 500) throw new Error('command is required')
  if (!Array.isArray(entry.args) || entry.args.length > 40 || entry.args.some((a) => typeof a !== 'string' || a.length > 500)) {
    throw new Error('args must be a list of up to 40 strings')
  }
  if (db.prepare('SELECT 1 FROM bot_mcp_servers WHERE name = ?').get(entry.name)) throw new Error(`an MCP server named ${entry.name} is registered`)
  db.prepare('INSERT INTO bot_mcp_servers (name, command, args, description, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(entry.name, entry.command.trim(), JSON.stringify(entry.args), entry.description.slice(0, 500), nowSec())
  return entry
}

// Removes the server and takes it off every bot that loads it.
export function removeMcpServer(db: Db, name: string): boolean {
  if (db.prepare('DELETE FROM bot_mcp_servers WHERE name = ?').run(name).changes !== 1) return false
  for (const row of db.prepare('SELECT name, mcp_servers FROM team_agents').all()) {
    const list = (JSON.parse(String(row.mcp_servers)) as string[]).filter((item) => item !== name)
    db.prepare('UPDATE team_agents SET mcp_servers = ? WHERE name = ?').run(JSON.stringify(list), String(row.name))
  }
  return true
}

export function listMcpServers(db: Db): McpServerEntry[] {
  return db.prepare('SELECT name, command, args, description FROM bot_mcp_servers ORDER BY name').all()
    .map((row) => ({ name: String(row.name), command: String(row.command), args: JSON.parse(String(row.args)) as string[], description: String(row.description) }))
}

export function mcpServersFor(db: Db, names: string[]): McpServerEntry[] {
  const all = new Map(listMcpServers(db).map((s) => [s.name, s]))
  return names.map((n) => all.get(n)).filter((s): s is McpServerEntry => s !== undefined)
}
