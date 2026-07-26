# Hands-on: watch one turn

Prepare the environment first: [1-setup.md](./1-setup.md).

The agent in `src/agent.py` calls no model. It runs one fixed turn, so every byte on the wire is predictable and you can compare what you read in [2-protocol.md](./2-protocol.md) against what actually happens.

## Step 1: run a turn

Send a prompt and watch the client render the stream:

```bash
uv run python src/client.py "summarize the readme"
```

The output shows a thought, a plan, a read tool call, a permission prompt, and then the answer arriving word by word. `stopReason: end_turn` closes it.

## Step 2: read the wire

Rendered output hides the protocol. Set `ACP_TRACE=1` to dump every raw line to stderr, and keep only the client's side:

```bash
ACP_TRACE=1 uv run python src/client.py "summarize the readme" 2>&1 >/dev/null | grep '^\[client'
```

Read the trace top to bottom and check three things.

Requests carry an `id` and get exactly one response with the same `id`. Notifications, meaning `session/update` and `session/cancel`, carry no `id` and get no response at all.

The `session/prompt` request with `id: 3` is sent early and answered last. Every update in between arrives while that request is still open. That interleaving is the whole streaming design.

The two sides number their requests independently. The client's `id: 1` is `initialize`; the agent's `id: 1` is `fs/read_text_file`. They do not collide because request ids are scoped per sender.

## Step 3: the agent does not touch the disk

Find the `fs/read_text_file` line in the trace. The agent knows the path, but it does not open the file. It asks the client, and the client opens it.

This is the structural point of ACP. `_resolve()` in `src/client.py` rejects any path that escapes the session directory, and that check lives in the client because the client is the only side the user actually trusts.

## Step 4: reject the write

Answer no to the permission request:

```bash
uv run python src/client.py "summarize the readme" --deny
```

The tool call moves to `failed`, `acp-out.txt` is not created, and the turn still ends with `end_turn`. A refused tool is a normal outcome, not a protocol error.

## Step 5: withhold the capability

Start the session without advertising the `fs` capabilities:

```bash
uv run python src/client.py "summarize the readme" --no-fs
```

The agent never emits a `tool_call` and says it cannot read files. Nothing was blocked at call time; the tool simply never existed for this session, because an omitted capability means unsupported. Compare the `initialize` line in the trace with the one from step 2.

## Step 6: break the stream yourself

Add a plain `print("hello")` at the top of `prompt()` in `src/agent.py` and run step 1 again. The client fails while parsing, because that line went to stdout and became a malformed ACP message.

Change it to `log("hello")` and the run recovers. This is the most common way a hand-written agent breaks, and it is worth causing once on purpose. Remove the line before moving on.

## Step 7: confirm all three paths

```bash
uv run python test_acp.py
```

The self-check asserts that an allowed turn writes the file, a rejected turn does not, and a session without the `fs` capability produces no tool call at all.
