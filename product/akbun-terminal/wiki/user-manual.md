# User manual

How to use akbun-terminal day to day. How it is built is in [architecture.md](./architecture.md).

## The three programs

| Program | What it is for |
|---|---|
| `akbun-terminal-core` | The daemon that owns your shells, and the command line for talking to it. Started for you; you rarely run `serve` yourself |
| `akbun-terminal-tui` | The workspace inside a terminal. Works over SSH |
| `akbun-terminal.app` | The workspace as a macOS window, with files, Git and documents beside the terminal |

A shell belongs to the daemon, not to the window showing it. That is the one idea the rest follows from: a window can close and the agent in the shell keeps working.

## Install

macOS app: open the dmg from the [releases](https://github.com/choisungwook/portfolio/releases) and drag the app to Applications. The build is unsigned, so clear the quarantine attribute once:

```bash
xattr -cr /Applications/akbun-terminal.app
```

Terminal UI and command line on macOS arm64: unpack `akbun-terminal-cli-*.tar.gz` from the same release and put both binaries in one folder on `PATH`. They have to sit together, because the terminal UI starts the daemon it finds beside itself.

```bash
tar -xzf akbun-terminal-cli-*.tar.gz -C ~/.local/bin
xattr -c ~/.local/bin/akbun-terminal-core ~/.local/bin/akbun-terminal-tui
```

Linux, or any machine with a Rust toolchain, from source:

```bash
cd product/akbun-terminal/workspace
cargo build --release
cp target/release/akbun-terminal-core target/release/akbun-terminal-tui ~/.local/bin/
```

## Terminal UI

Start it from any terminal. It starts the daemon when none is running.

```bash
akbun-terminal-tui
```

The screen has a sidebar on the left, a tab strip and a terminal on the right, and one status line at the bottom. Everything you type goes to the shell in the terminal. `Ctrl+G` is the one key the UI keeps: press it, then one more key.

First run:

1. `Ctrl+G` `P` makes a project. Give it a name and a folder; the folder defaults to where you started the UI.
2. `Ctrl+G` `w` makes a workspace in it. A shell opens in the project folder.
3. `Ctrl+G` `c` opens another tab in the same workspace.

Keys after `Ctrl+G`:

| Key | Does |
|---|---|
| `c` | new tab |
| `x` | close the tab and end its shell |
| `n` / `p` | next / previous tab |
| `j` / `k` or Down / Up | next / previous row in the sidebar |
| `a` | switch the sidebar between Workspaces and Agents |
| `b` | hide or show the sidebar |
| `P` | new project |
| `w` | new workspace in the selected project |
| `r` | rename the selected project, workspace or agent |
| `R` | rename the current tab |
| `d` | delete the selected workspace, after a `y` |
| `PgUp` / `PgDn` | scroll back / forward |
| `q` | quit; the shells keep running |
| `?` | this list |
| `Ctrl+G` | send a real `Ctrl+G` to the shell |
| `Esc` | cancel |

Without the prefix, `Shift+PgUp` and `Shift+PgDn` scroll, and so does the mouse wheel. A click selects a sidebar row, a tab, or the `Workspaces` / `Agents` header.

Quitting with `Ctrl+G` `q` leaves every shell running. Start the UI again and they are back with what they had on screen. To end a shell, close its tab with `Ctrl+G` `x` or type `exit` in it.

## Agent status

The core watches each shell and marks what the agent in it is doing.

| Mark | Status | Means |
|---|---|---|
| `·` | idle | no agent, or one with nothing to say |
| `●` | running | working |
| `▲` | needs_attention | waiting for your answer |
| `✓` | completed | finished, and you have not looked yet |
| `✗` | failed | ended badly |

A workspace takes the most blocked status of its tabs. Opening a completed tab clears the mark, because finished means nobody has looked.

The Agents view (`Ctrl+G` `a`) lists every shell that has an agent in it, across all workspaces, with the helpers an agent started indented under it. Choosing a row goes to that shell's tab. A shell started from the command line with no workspace shows up under `unassigned`.

Which screen text means which status is one JSON file per agent, in `agents/` under the data directory. The core writes the ones it ships the first time, so they double as the example:

```json
{
  "name": "Claude Code",
  "processes": ["claude"],
  "asking": ["Do you want to"],
  "running": ["esc to interrupt"],
  "done": ["? for shortcuts"]
}
```

`processes` is required and decides whether the rule applies: it is matched against every process under the shell. The other three are phrases looked for on the screen. A new agent is a new file; no rebuild.

## Agents working together

An agent in a shell can start other shells, hand them work, and hear back, all through `akbun-terminal-core`. Tell your agent to run `akbun-terminal-core skill` once; it prints the manual written for agents.

A typical exchange, from inside the lead agent's shell:

```bash
akbun-terminal-core run --name reviewer --cwd /path/to/repo -- claude
akbun-terminal-core send reviewer "Review the diff here. List real bugs only."
akbun-terminal-core wait reviewer --timeout 600
akbun-terminal-core read reviewer
akbun-terminal-core kill reviewer
```

| Command | Does |
|---|---|
| `run [--name N] [--cwd DIR] [--workspace ID] -- <cmd> [args…]` | starts a shell running the program and prints its id. Started from inside a shell, the new one becomes its child and joins its workspace |
| `send <t> <text…>` | types the text into the shell and presses return |
| `read <t>` | prints what is on its screen now. A screen, not a log |
| `wait <t> [--timeout SECS]` | returns when it stops working, asks something, or exits. Exit code 0; 2 on timeout (default 180 seconds) |
| `ls [--json]` | every shell: id, name, parent, agent, status, folder |
| `kill <t>` | ends a shell |
| `skill` | the manual for agents |

`<t>` is a shell's id or the name given with `--name`. Names are unique among running shells.

A message sent from inside a shell arrives wrapped, so the receiver can tell another agent's words from yours and knows whom to answer:

```text
<akbun from="3 lead">Review the diff here. List real bugs only.</akbun>
```

Nothing is typed into a parent on its own. A helper reports with `send` to its parent's id; ask for that in the task you give it.

You can watch any of this happen: every shell an agent starts appears in the terminal UI as a tab, and you can type into it yourself.

## macOS app

The app shows the same projects and workspaces. Its shells are its own: closing a tab, the window or the app ends them, and a shell started in the app does not stay behind when the app quits. What the app adds around the terminal — the file pane, Git history, document tabs, search, themes, shortcuts, updates — is listed in the [README](../README.md).

Two things the terminal UI has that the app does not yet: coming back to shells left running, and the Agents view. A project made in the terminal UI shows in the app after the app is reopened.

## Stopping and files

```bash
akbun-terminal-core ls      # what is running
akbun-terminal-core stop    # end every shell and the daemon
```

The daemon stops by itself ten seconds after the last window has gone and no shell is left. While a shell is running it stays, which is the point.

| What | Where |
|---|---|
| data directory | `~/Library/Application Support/io.akbun.terminal` on macOS, `~/.local/share/akbun-terminal` on Linux. `AKBUN_TERMINAL_HOME` overrides it |
| projects and settings | `projects.json` in the data directory |
| agent rules | `agents/*.json` in the data directory |
| daemon log | `core.log` in the data directory |
| socket | `core.sock` in the data directory. `AKBUN_TERMINAL_SOCKET` overrides it |

Setting `AKBUN_TERMINAL_HOME` to an empty folder gives a second, separate daemon with its own projects and shells, which is the safe way to try something.

## When something is wrong

| Symptom | Cause and fix |
|---|---|
| `the daemon is not running` from the command line | Only `run` and the two UIs start the daemon. Start one of them, or `akbun-terminal-core serve` |
| The terminal UI prints `lost the connection to the daemon` and exits | The daemon was stopped or crashed. Read `core.log`, then start the UI again |
| An agent's status never changes | No rule file names its process. Check `akbun-terminal-core ls`: the `agent` column is `-` when no rule matched. Add a file under `agents/` |
| `wait` returns at once | The shell has no agent in it, so it reads as idle. `wait` is for shells running an agent |
| After rebuilding from source, the old behaviour remains | The daemon is still the old binary. `akbun-terminal-core stop`, then start again |
| The app's tabs stop responding after `akbun-terminal-core stop` | The app does not reconnect yet. Quit and reopen it |
