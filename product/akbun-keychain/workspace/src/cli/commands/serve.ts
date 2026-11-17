import { FAIL_USAGE, type Command, flag, option, usageError } from '../command.ts'

export const mcp: Command = {
  name: 'mcp',
  summary: 'Run the MCP server on stdio for an AI client',
  needs: 'nothing',
  usage: 'akbun-keychain mcp',
  description:
    'Serves the MCP tools keychain_status, list_keys, run_with_secrets, get_secret and create_secret on stdin and ' +
    'stdout. The AI client starts it. It never asks for the root password; while locked, tools return LOCKED.',
  positionals: [],
  options: [],
  examples: ['claude mcp add akbun-keychain -- akbun-keychain mcp', 'akbun-keychain mcp < /dev/null'],
  exitCodes: [[0, 'The client closed the connection.']],
  ifFails: [[1, 'Unexpected error. Check that the client starts `akbun-keychain mcp`.']],
  async run() {
    const { serveMcp } = await import('../../mcp/server.ts')
    await serveMcp()
    return 0
  },
}

export const gui: Command = {
  name: 'gui',
  summary: 'Open the page to manage keys in the browser',
  needs: 'password',
  usage: 'akbun-keychain gui [--port <n>] [--no-open]',
  description:
    'Serves a page on 127.0.0.1 and opens it. The page asks for the root password. The server stops on logout, ' +
    'Ctrl+C, 10 minutes without a request, or the fifth wrong password.',
  positionals: [],
  options: [
    { name: 'port', type: 'string', placeholder: 'n', default: 'random', description: 'Port to listen on.' },
    { name: 'no-open', type: 'boolean', description: 'Print the URL instead of opening a browser.' },
  ],
  examples: ['akbun-keychain gui', 'akbun-keychain gui --no-open --port 8765'],
  exitCodes: [[0, 'Stopped.'], [2, 'Invalid --port.'], [4, 'Five wrong passwords.']],
  ifFails: [FAIL_USAGE, [4, 'Five wrong passwords ended the server. Start it again.']],
  async run(context) {
    const portText = option(context.args, 'port')
    const port = portText === undefined ? 0 : Number(portText)
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw usageError('--port must be 0 to 65535', 'gui')
    const { serveGui } = await import('../../gui/server.ts')
    return serveGui({ port, open: !flag(context.args, 'no-open'), print: (text) => context.io.out(`${text}\n`) })
  },
}
