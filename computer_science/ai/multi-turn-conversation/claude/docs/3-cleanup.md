# Trade-offs and cleanup — Claude track

## What the accumulate-and-resend approach costs

It is the default because it is simple and portable, not because it is free.

- **Input tokens grow quadratically over a session.** Turn N resends turns 1
  through N-1. A long chat spends most of its budget on re-reading itself.
- **The context window ends the conversation.** History accumulates until the
  request stops fitting, and then truncation, summarization, or compaction has
  to kick in — none of which is lossless.
- **The transcript is now yours to operate.** Storage, retention, access
  control, and deletion requests all land on the application, not the provider.

What it buys is worth the price for most systems: the full transcript is
inspectable, editable, portable between providers, and easy to reason about.
Nothing is hidden on someone else's server.

## When to reach for Managed Agents instead

A Managed Agents session keeps the conversation on Anthropic's side and has you
exchange events rather than message arrays. That is the right call when the
conversation is long-lived, the client is thin, and provider lock-in is
acceptable. It is the wrong call when the transcript has to be audited, edited
mid-conversation, or moved to another provider — server-side state is a
convenience that trades away exactly that control.

The OpenAI equivalent is `previous_response_id` on the Responses API, covered
in the OpenAI track at [../../openai/docs/3-cleanup.md](../../openai/docs/3-cleanup.md).

## Picking a store

Start at the top of the list and stop at the first row that holds.

| Situation | Store |
|---|---|
| Script, notebook, single-shot job | memory |
| One local process, want the transcript readable and greppable | JSONL |
| Several processes or pods share a session, sessions should expire | Redis |
| Need search, analytics, or retention policy on old conversations | a database |

Redis carries an operational cost that a local file does not: a server to run,
memory to size, and a TTL to pick. Do not reach for it until something actually
crosses a process boundary.

## Clean up

This stops Redis, removes its data, and deletes the local sessions and the
virtualenv. Details and the Homebrew variant are in [setup.md](./setup.md).

```bash
docker compose down -v && rm -rf sessions .venv
```

Confirm nothing is left listening on the Redis port.

```bash
redis-cli ping
```

A `Connection refused` here is the success case.
