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

**Resize.** The emulator recomputes its cell grid on layout and reports it; the core resizes the pty. A shell that is not told stays at the old size and every interactive program in it draws wrong.

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

| Event | Notes |
|---|---|
| `output` | shell bytes for a session |
| `exited` | the shell ended; the view stops taking keys |

## Where the next milestones attach

- Projects and workspaces: state and persistence in the core, the sidebar reads it.
- Agent state colours: the core already sees every byte, so detection reads the same stream the view draws.
- File browser, markdown, URL menu: directory reads, parsing and URL rules in the core; presentation in the shell.
