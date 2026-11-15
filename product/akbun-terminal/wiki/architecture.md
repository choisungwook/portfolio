# Architecture

## Process structure

Three programs. The core is a daemon; the macOS app and the terminal UI are clients that find it on a Unix socket and start it when it is not there.

```text
akbun-terminal-core           Rust daemon: protocol, app, sessions, hub
  portable-pty                pty and child process, one per shell
      ▲ Unix socket, one JSON document per line
      ├── akbun-terminal.app  Swift, AppKit: window, views, menus
      │     AkbunTerminalCore   protocol types, CoreBridge, CoreConnection
      ├── akbun-terminal-tui  Rust, ratatui: sidebar, tabs, a terminal in a terminal
      └── akbun-terminal-core run | send | read | wait | ls   the CLI agents use
```

The split is by who owns what. Shells, the project tree and agent status have to outlive any one window and be the same for every window, so they are in the daemon. A client holds only what it draws.

The daemon exits by itself after ten seconds with no connection and no shell, on `shutdown`, and on SIGTERM or SIGINT, ending and reaping every shell.

## The boundary

Every call is one JSON envelope:

```json
{"v":3,"command":{"type":"spawn","cwd":"/Users/me/code","cols":120,"rows":40}}
```

The version is checked by the core before the command is read. A shell built against a different version gets an error response, never a partial parse.

It travels over a Unix socket, one document per line. What comes back is wrapped so a reply can be told from an event:

```json
{"reply":{"type":"spawned","session":4}}
{"event":{"type":"output","session":4,"bytes":[104,105]}}
```

Replies come in request order on each connection. Events arrive between them at any time.

| What | Where |
|---|---|
| data directory | `$AKBUN_TERMINAL_HOME`, else `~/Library/Application Support/io.akbun.terminal` on macOS, else `$XDG_DATA_HOME/akbun-terminal` or `~/.local/share/akbun-terminal` |
| socket | `$AKBUN_TERMINAL_SOCKET`, else `core.sock` in the data directory |
| daemon binary | `$AKBUN_TERMINAL_CORE`, else `akbun-terminal-core` beside the client, else on `PATH` |

**Who hears what.** `hub.rs` keeps, per connection, the sessions it is attached to. One pump thread takes each shell event and, under the hub's lock, appends output to that session's replay tail (256 KiB of raw bytes) and queues it for every attached connection. `attach` copies the tail and subscribes under the same lock, so a viewer sees every byte once: none lost and none twice between the replay and the live stream. Each connection has its own outbound queue and writer thread; one that falls behind is dropped and its shells keep running.

## Key flows

**Launch.** The app sweeps update leftovers, connects to the daemon or starts the one inside its bundle, runs the handshake, and only then opens a window. A daemon on another protocol is asked to shut down and replaced once; a core that still will not answer ends in an alert rather than an empty window.

**Opening a tab.** A workspace is selected in the sidebar, the shell spawns a session in the project folder and adds a tab for it. `TerminalTabs` decides which tab is on screen, including after a close; the core only knows the sessions.

**Keystroke.** The view hands bytes to `onInput`, the controller wraps them in a `write` command, the core writes them into the pty master. The view never sees a file descriptor.

**Output.** The session's reader thread pushes `output` events onto a queue in the core, the hub fans them out to attached connections, and `CoreConnection`'s reader thread queues them on the Swift side. A timer on the main run loop drains that queue about once a frame and hands bytes to the view, so the question of which thread may draw never arises.

**Resize.** The emulator recomputes its cell grid on layout and reports it; the core resizes the pty. A shell that is not told stays at the old size and every interactive program in it draws wrong. Zooming takes the same path: one `Zoom` value gives the view a point size, the view works out how many cells now fit and reports that. Every other pane reads the same value, which is why the tab strip, the tree, the file list and a rendered document change size together with the terminal.

**Judging.** Every session's bytes also go into an interpreted screen, on the reader thread that already has them. The daemon judges on its own two-second timer while any shell exists: one `ps` snapshot names the processes under each shell and the rule files say what the screens mean. A client's `detect` reads that judgement and answers only what moved since that connection last asked, so two clients do not take each other's changes. The app paints those and raises a notification for the ones that finished.

**Opening a file.** A single click in the file pane opens a tab and asks the core only for text. View mode delegates source highlighting to HighlighterSwift and Highlight.js. Markdown Preview delegates parsing and rendering to bundled markdown-it, Highlight.js and Mermaid in a non-persistent WebKit view; raw document HTML is disabled. Command E swaps View and Edit, and Command S writes through `write_file`.

**Opening the Git tree.** The right pane asks the core for a bounded, topologically ordered log across branches, remotes and tags. The shell assigns graph lanes to that ordered list and draws the commit lines beside refs, subject, author, time and short hash. A three-second refresh only reloads the Git view while it is visible.

**Clicking a commit.** The tree hands the hash to `git_show`. The core reads the commit's own fields and its patch, splits the patch per file and counts each file's added and removed lines from that same piece, so a row and the lines under it cannot disagree. The shell draws the file list and colours one file's diff through `GitDiff`, which is in the core package and tested without a window. A merge is shown against its first parent, because that is the change the branch brought in. A reload puts the selection back by hash rather than by row: a commit made since has pushed every row down by one.

**Looking at what is waiting.** The Staged pane asks `git_working`, which reads the same porcelain as the status colours but keeps the two columns apart as two lists of files, and adds `git stash list`. A file staged and then edited again is in both lists, because that is the state it is in. Nothing in the pane writes to the repository; the shell in the middle of the window is where staging happens, and a second way to do it could disagree with the first.

**Opening HTML.** HTML has no internal Render mode. `Open in Browser` is an independent action that hands the saved local file to the system browser. A dirty buffer first offers Save and Open, Open Saved Version or Cancel. The app never executes document JavaScript in its own process.

**Clicking a Markdown link.** The preview cancels WebKit navigation. A relative file opens in an app tab, http and https go to the system browser, and every other scheme is ignored.

**Clicking a terminal link.** The view turns the point into a row of text and a column and hands both to the core. The core finds the word, trims what a sentence left on it, and answers only for http and https. Nothing is opened without that answer.

**Spawn environment.** The core sets `TERM` on the child. A GUI process inherits none, and a shell that does not know what is drawing it writes for a dumb terminal.

**Quit.** The macOS app closes every session it opened; the terminal UI closes none, which is what lets it come back to them. Closing kills and waits, because an unreaped shell becomes a zombie and closing tabs all day is how they accumulate. A shell that exits on its own is removed by the daemon, which then says `exited`.

**Coming back.** A client asks `sessions`, then `attach` for each one it wants on screen. The reply carries the replay tail, which the client feeds to its emulator before any live output. The tail is raw bytes rather than a picture of the screen because the core's own screen keeps characters and drops colour; the resize a client sends after attaching makes a full screen program draw itself again.

**One agent hands work to another.** `akbun-terminal-core run` spawns a shell with a name, a command and, taken from `AKBUN_TERMINAL_SESSION`, the shell it was started from as its parent. `send` types text into a shell and presses return a moment later, as a bracketed paste when the program asked for one, wrapped in `<akbun from="…">` when it comes from another shell. `wait` holds its connection until the target stops working, exits, or a timeout passes. Nothing is typed into a parent on its own; a child reports with `send`.

## Command surface

| Command | Response | Notes |
|---|---|---|
| `hello` | `hello` | protocol handshake, first call |
| `hello` + `version` | | the reply also names the product version |
| `spawn` | `spawned` | empty `cwd` means the home directory; optional `name`, `command`, `parent`; attaches the caller |
| `sessions` | `sessions` | every live shell with its name, parent, workspace, size, agent and status |
| `attach`, `detach` | `attached`, `ok` | start and stop hearing a shell; `attached` carries the replay tail |
| `send` | `ok` | text into a shell, then return |
| `read` | `text` | what is on a shell's screen |
| `wait` | `waited` | until it stops working, exits or times out |
| `rename_session` | `ok` | names are unique among live shells |
| `shutdown` | `ok` | ends every shell and the daemon |
| `write` | `ok` | bytes, not text |
| `resize` | `ok` | cells, not pixels |
| `close` | `ok` | kills and reaps |
| `load_state`, `create_project`, `create_workspace`, `set_theme` | `state` | every mutation answers with the whole tree |
| `rename_project`, `delete_project`, `rename_workspace`, `delete_workspace` | `state` | ids are never reused, and nothing on disk is touched |
| `read_directory` | `entries` | one level, hidden entries included, links left as leaves |
| `git_status` | `git` | what git makes of a folder, directories included; not being a repository is an answer |
| `git_log` | `git_log` | latest 200 commits across branches, remotes and tags in topological order |
| `git_show` | `git_detail` | one commit's message body and its patch, split per file; absent for a hash this repository does not have |
| `git_working` | `git_working` | the index, the working tree and the stash as three lists |
| `read_file`, `write_file` | `file`, `ok` | the shell handles text, never a path on disk |
| `themes` | `themes` | the known palettes as hex |
| `load_rules` | `ok` | reads one JSON file per agent, seeding the shipped ones |
| `detect` | `statuses` | judges every workspace with a session, answering only what moved |
| `clear_status` | `ok` | takes the finished colour off a workspace that has been opened |
| `url_at` | `url` | the URL under a click, absent when there is nothing openable there |

| Event | Notes |
|---|---|
| `output` | shell bytes for a session |
| `exited` | the shell ended and the daemon has removed it; the view stops taking keys |
| `state` | the tree after another connection changed it |

## Agent rules

One JSON file per agent, in `agents/` under the app data directory. The core writes the three it ships the first time the directory is empty, so the shipped files are also the worked example.

```json
{
  "name": "Claude Code",
  "processes": ["claude"],
  "asking": ["Do you want to"],
  "running": ["esc to interrupt"],
  "done": ["? for shortcuts"]
}
```

`processes` is matched against every process in the tree under the shell, not just its direct child, and it is the one field a rule cannot leave out: it decides whether the rule applies at all. The other three are optional substrings looked for on the interpreted screen, in the order asking, running, done. A file that will not parse, or one without `processes`, costs that agent its colours and nothing else.

## Where the next milestones attach

- A second window: `TerminalWindowController` already holds everything a window owns, and the core keys sessions by id rather than by window.
- The macOS app coming back to its shells: `sessions` and `attach` exist, and `TerminalWindowController` would rebuild a workspace's tabs from them instead of closing them at quit.
- An agents list in the macOS app: `sessions` already answers with `agent` and `status`.
- Windows: the socket is a Unix one.
