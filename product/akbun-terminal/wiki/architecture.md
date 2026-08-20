# Architecture

## Process structure

One process. The Swift executable links the Rust core as a static archive, so there is no daemon, no socket and no second binary to ship.

```text
akbun-terminal.app
  akbun-terminal            Swift, AppKit: window, views, menus
    AkbunTerminalCore       Swift: protocol types, the bridge, update helpers
      CAkbunTerminalCore    the hand written header
        libakbun_terminal_ffi.a
          akbun-terminal-core   Rust: protocol, app, sessions
            portable-pty        pty and child process
```

The split is by expected lifetime rather than by layer. The shell is the part most likely to be rewritten, so nothing that has to survive that rewrite lives in it.

## The boundary

Every call is one JSON envelope:

```json
{"v":1,"command":{"type":"spawn","cwd":"/Users/me/code","cols":120,"rows":40}}
```

The version is checked by the core before the command is read. A shell built against a different version gets an error response, never a partial parse.

Five C functions carry it, and that number does not grow with features:

| Function | Purpose |
|---|---|
| `akbun_core_new` | creates the core |
| `akbun_core_dispatch` | one command, one response |
| `akbun_core_poll_event` | the next queued event, or NULL |
| `akbun_core_string_free` | returns a string the core allocated |
| `akbun_core_free` | ends every shell and frees the core |

Moving this to a socket later means replacing `CoreBridge` and adding a transport in the core. The types, the version and every test above them stay as they are.

## Key flows

**Launch.** The shell sweeps update leftovers, creates the core, runs the handshake, and only then opens a window. A protocol mismatch or a core that will not start ends in an alert rather than an empty window.

**Opening a tab.** A workspace is selected in the sidebar, the shell spawns a session in the project folder and adds a tab for it. `TerminalTabs` decides which tab is on screen, including after a close; the core only knows the sessions.

**Keystroke.** The view hands bytes to `onInput`, the controller wraps them in a `write` command, the core writes them into the pty master. The view never sees a file descriptor.

**Output.** The session's reader thread pushes `output` events onto a queue in the core. A timer on the main run loop drains the queue about once a frame and hands bytes to the view. The core never calls into Swift, so the question of which thread may draw never arises.

**Resize.** The emulator recomputes its cell grid on layout and reports it; the core resizes the pty. A shell that is not told stays at the old size and every interactive program in it draws wrong. Zooming takes the same path: one `Zoom` value gives the view a point size, the view works out how many cells now fit and reports that. Every other pane reads the same value, which is why the tab strip, the tree, the file list and a rendered document change size together with the terminal.

**Judging.** Every session's bytes also go into an interpreted screen, on the reader thread that already has them. A second timer, two seconds apart from the one that draws, asks the core to judge: one `ps` snapshot names the processes under each shell, the rule files say what the screens mean, and the answer is only the workspaces that moved. The shell paints those and raises a notification for the ones that finished.

**Clicking a link.** The view turns the point into a row of text and a column and hands both to the core. The core finds the word, trims what a sentence left on it, and answers only for http and https. Nothing is opened without that answer.

**Spawn environment.** The core sets `TERM` on the child. A GUI process inherits none, and a shell that does not know what is drawing it writes for a dumb terminal.

**Quit.** The window controller closes every session it opened, and freeing the core clears whatever is left. Both paths kill and wait, because an unreaped shell becomes a zombie and closing tabs all day is how they accumulate.

## Command surface

| Command | Response | Notes |
|---|---|---|
| `hello` | `hello` | protocol handshake, first call |
| `spawn` | `spawned` | empty `cwd` means the home directory |
| `write` | `ok` | bytes, not text |
| `resize` | `ok` | cells, not pixels |
| `close` | `ok` | kills and reaps |
| `load_state`, `create_project`, `create_workspace`, `set_theme` | `state` | every mutation answers with the whole tree |
| `rename_project`, `delete_project`, `rename_workspace`, `delete_workspace` | `state` | ids are never reused, and nothing on disk is touched |
| `read_directory` | `entries` | one level, hidden entries included, links left as leaves |
| `git_status` | `git` | what git makes of a folder, directories included; not being a repository is an answer |
| `read_file`, `write_file` | `file`, `ok` | the shell handles text, never a path on disk |
| `render_markdown` | `markdown` | blocks, and where raw HTML is dropped |
| `themes` | `themes` | the known palettes as hex |
| `load_rules` | `ok` | reads one JSON file per agent, seeding the shipped ones |
| `detect` | `statuses` | judges every workspace with a session, answering only what moved |
| `clear_status` | `ok` | takes the finished colour off a workspace that has been opened |
| `url_at` | `url` | the URL under a click, absent when there is nothing openable there |

| Event | Notes |
|---|---|
| `output` | shell bytes for a session |
| `exited` | the shell ended; the view stops taking keys |

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
- Windows and Linux: the core is portable apart from `agent.rs`, which shells out to `ps`. The shell is AppKit throughout.
