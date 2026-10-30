# App and CLI share the catalog file

## Decision

There is no socket, server or MCP endpoint between the app and the CLI. Both read and write one JSON catalog. Writers take an exclusive file lock, read, change, bump a revision number, write a temp file and rename it into place. The page polls the revision every two seconds and reloads when it moves.

## Reason

A control socket needs the app to be running and needs a protocol to version. A file needs neither: an agent can tag a thousand photos with the app closed, and the next launch shows them. The lock means a CLI write and an app write cannot lose each other's change; the rename means a reader never sees half a file.

The cost is a two-second delay before a CLI change appears, and a full rewrite per change. JSON at tens of thousands of photos is a few megabytes, which writes in milliseconds; SQLite is the move if that stops being true.
