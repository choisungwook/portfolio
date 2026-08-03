# Architecture

## Components

```text
cli.py                argparse surface; maps AgentK8sError to exit code 1
config.py             akbun-agent.toml -> AgentConfig (tomllib, no deps)
commands/
  learn.py            per-service extraction -> graph + docs
  ask.py              one-shot question with graph context
  chat.py             multi-turn session (native resume or transcript replay)
  status.py           config + knowledge freshness, no backend call
backends/
  base.py             AgentBackend protocol, AgentRun dataclass
  claude_backend.py   Claude Agent SDK
  codex_backend.py    codex exec subprocess
knowledge.py          KnowledgeStore (graph.json + services/*.md), graph_context()
linker.py             pure edge derivation from learned data
prompts.py            prompt builders, JSON extraction, transcript replay
```

Everything above `backends/` is pure and tested without any SDK or login;
tests inject a `FakeBackend`.

## The learn flow

1. `load_config` reads `akbun-agent.toml`: service name -> local checkout path.
2. For each service, one backend run happens with `workdir` set to the service
   checkout. The prompt (prompts.py `LEARN_SCHEMA`) asks for language, summary,
   APIs, outbound calls with file:line evidence, produced and consumed event
   topics, and a markdown doc.
3. `extract_json` pulls the JSON object out of the response (fenced block
   first, then outer braces). A service that fails to parse is reported and
   skipped; the run continues and exits 1 to signal partial success.
4. `linker.build_edges` derives edges without any LLM:
   - call edges: each outbound call target (URL, env var name, hostname) is
     matched against registered service names after normalizing separators;
     the longest matching name wins, unmatched targets keep the raw string
     and `resolved: false`.
   - event edges: producer and consumer are joined on identical topic names.
5. `KnowledgeStore` writes `knowledge/graph.json` and `knowledge/services/<name>.md`.

## The debug flow (ask and chat)

1. `graph_context` renders the graph as compact text: services with APIs, then
   edges with evidence.
2. That text goes into the system prompt (`build_debug_system_prompt`), which
   instructs: likely cause first, then the propagation path, then file:line
   evidence, then what to check next.
3. The backend runs with `workdir` = the knowledge directory (so it can read
   the per-service docs) and `readable_dirs` = every service checkout (so it
   can open source files at evidence paths). Logs passed with `--log` or
   `/log` are inlined into the user prompt.

## Knowledge format

`graph.json`:

```json
{
  "version": 1,
  "learned_at": "2026-08-03T09:00:00+00:00",
  "services": {
    "order": {
      "path": "/abs/path/order-service",
      "language": "python",
      "summary": "...",
      "apis": [{"method": "POST", "path": "/orders", "description": "..."}],
      "outbound_calls": [{"target": "PAYMENT_SERVICE_URL", "kind": "http",
                          "detail": "...", "evidence": "clients.py:12"}],
      "produces": ["order.completed"],
      "consumes": []
    }
  },
  "edges": [{"from": "order", "to": "payment", "kind": "http",
             "detail": "...", "evidence": "clients.py:12", "resolved": true}]
}
```

The knowledge directory is plain files on purpose: reviewable in git, directly
readable by the agent, replaceable by re-running `learn`. See the ADRs for the
comparison against graph databases and vector RAG.

## Backend contract

`AgentBackend.run(prompt, *, workdir, system_prompt, readable_dirs, resume_id)
-> AgentRun(text, session_id)`.

- claude: Claude Agent SDK, `allowed_tools=["Read", "Glob", "Grep"]` with
  `permission_mode="dontAsk"` — reads are auto-approved, everything else is
  denied without prompting, so a run can neither hang on a prompt nor write.
  Returns the SDK session id, so chat resumes natively via `resume`.
- codex: `codex exec --sandbox read-only --cd <workdir> --skip-git-repo-check
  --output-last-message <tmpfile>`. No usable session id, so `session_id` is
  None and chat replays the transcript each turn (`build_transcript_prompt`).

The chat command only branches on `session_id is None`, so a new backend picks
its own continuation style by what it returns.
