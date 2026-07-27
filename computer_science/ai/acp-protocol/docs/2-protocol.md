# The protocol

ACP is JSON-RPC 2.0 over stdio. The editor launches the agent as a subprocess and writes to its stdin; the agent answers on its stdout. Messages are newline-delimited UTF-8 and must not contain an embedded newline, so one message is always one line.

That last rule is the practical trap. Any stray `print()` in an agent lands on stdout in the middle of the stream and corrupts it. `src/agent.py` logs to stderr for this reason.

## Who is the client

ACP inverts the roles people expect from MCP. Learning the table below is most of the conceptual work.

| | Client | Server or agent |
|---|---|---|
| MCP | the agent | a tool provider such as a filesystem or GitHub server |
| ACP | the editor | the agent |

A coding agent is therefore an MCP client and an ACP agent at the same time. The two protocols compose rather than compete, and ACP reuses MCP's `ContentBlock` shape verbatim so an agent can forward MCP tool output without translating it. ACP adds the types MCP lacks for editor work: diffs, plans, and terminals.

The editor also hands its own MCP server configuration to the agent in `session/new`, under `mcpServers`. The agent connects to those servers itself.

## Methods and their direction

Baseline methods work without any capability negotiation. Everything else is gated.

| Direction | Method | Note |
|---|---|---|
| client to agent | `initialize` | version and capability exchange |
| client to agent | `session/new` | takes `cwd` and `mcpServers` |
| client to agent | `session/prompt` | one turn; returns a `stopReason` |
| client to agent | `session/cancel` | notification, no response |
| client to agent | `session/load` | needs the `loadSession` capability |
| agent to client | `session/update` | notification; the entire streaming API |
| agent to client | `session/request_permission` | the only baseline agent-to-client request |
| agent to client | `fs/read_text_file`, `fs/write_text_file` | need the `fs` capabilities |
| agent to client | `terminal/*` | needs the `terminal` capability |

Two conventions apply everywhere: all file paths must be absolute, and line numbers are 1-based.

## The handshake

`protocolVersion` is a single integer, the major version. Version 1 is current and stable. The client sends the newest version it knows, and the agent either echoes it or answers with its own newest, at which point the client decides whether to continue.

The rule that matters more than the version number: an omitted capability means unsupported. Adding a capability is never a breaking change, so agents must inspect what was offered instead of assuming.

This is `initialize` as `src/client.py` sends it:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
  "protocolVersion":1,
  "clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true}},
  "clientInfo":{"name":"demo-acp-client","version":"0.1.0"}}}
```

## Streaming is a notification, not a channel

There is no SSE and no WebSocket. While the agent works on a `session/prompt` that has not yet been answered, it sends `session/update` notifications on the same stdio pipe. Each one carries a `sessionUpdate` discriminator that tells the editor what to paint.

Version 1 defines eleven variants. The ones this hands-on emits are `agent_thought_chunk`, `agent_message_chunk`, `plan`, `tool_call`, and `tool_call_update`. The rest cover user echo, slash commands, mode and config changes, session info, and token usage.

One streamed token of the final answer looks like this:

```json
{"jsonrpc":"2.0","method":"session/update","params":{
  "sessionId":"sess_7d0b9ecba112",
  "update":{"sessionUpdate":"agent_message_chunk",
            "messageId":"msg_final",
            "content":{"type":"text","text":"Done. "}}}}
```

`messageId` is opaque. The same value means the same message is still growing; a new value starts a new one.

Tool calls carry a different union from message content. `ToolCallContent` is either `{"type":"content"}` wrapping a normal ContentBlock, `{"type":"diff", "path", "oldText", "newText"}`, or `{"type":"terminal", "terminalId"}`. The diff variant is what lets an editor show a proposed edit before it happens, and it is the clearest example of what ACP adds on top of MCP.

## Why the turn ends

`session/prompt` resolves with one of five values: `end_turn`, `max_tokens`, `max_turn_requests`, `refusal`, or `cancelled`. A cancelled turn must resolve with `cancelled` rather than a JSON-RPC error, so that clients do not show a user-initiated stop as a failure.
