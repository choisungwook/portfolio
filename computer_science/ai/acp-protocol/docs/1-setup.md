# Setup

Everything in this hands-on runs on the Python standard library. There is no Docker image, no API key, and no network call, because the subject is the wire format rather than a model.

## Requirements

Python 3.11 or newer. macOS ships an older Python, so install `uv` and let it manage the interpreter.

Install uv with Homebrew:

```bash
brew install uv
```

## Up

Create the virtual environment and confirm the demo works. `uv sync` reads `pyproject.toml`, which declares no dependencies, so this only pins an interpreter.

```bash
uv sync && uv run python test_acp.py
```

The self-check drives three turns and prints `all checks passed` at the end. If it does, the client and the agent are talking.

## Down

Delete the virtual environment and the file the agent wrote:

```bash
rm -rf .venv acp-out.txt
```

## If you skip uv

Any Python 3.11+ interpreter works, since nothing is installed:

```bash
python3 test_acp.py
```

## What runs where

The client is the parent process. It launches `src/agent.py` as a subprocess and speaks to it over that subprocess's stdin and stdout. Nothing listens on a port and nothing is written outside this directory, so there is no service to stop and no state to reset beyond the two paths above.
