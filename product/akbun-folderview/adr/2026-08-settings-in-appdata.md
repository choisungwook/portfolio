# Settings and library in the user data folder, not Program Files

## Decision

Store `settings.json` and `library.json` under `app.getPath('userData')`, which on Windows resolves to `%APPDATA%\akbun-folderview`. Write both through a temp file and a rename. Show the folder in Settings with a button that opens it.

## Reason

The starting assumption was that `C:\Program Files\<app>` is where a Windows application keeps its configuration. That was the convention a long time ago and it stopped being true when Windows made that tree read-only for a normal user. A write there either fails outright or is redirected into a per-user shadow copy under `VirtualStore`, which is worse than failing: the write appears to succeed and the file is somewhere the app never looks again. Program Files holds the program. It does not hold what the program remembers.

`%APPDATA%` is the answer for per-user state that should follow the user, and `app.getPath('userData')` is how Electron names it without hard coding a path. It also means the same code finds the right place on macOS and Linux, which keeps `npm start` working while developing on another platform.

The temp file and rename matter more here than in most apps. The settings file is small and easy to recreate; the library file holds every tag and rating the user has ever set, and none of that exists anywhere else. A crash or a power cut in the middle of a direct write leaves a truncated JSON file, which fails to parse on the next start, which falls back to an empty library. Writing to `library.json.tmp` and renaming it over the target makes the replacement atomic, so the old file survives until the new one is complete.

The same reasoning is why the installer is per user. It installs into the user folder, so it needs no administrator rights, and both the install and the data live in places the user actually owns.
