# Settings sit next to the recordings

## Decision

`settings.json` is written to `~/Documents/akbun-makepodcast/`, the same folder recordings default to, rather than to the platform application data folder. It is written through a temp file and a rename. If the user later moves the recordings folder, `settings.json` stays where it is.

## Reason

This is deliberately the opposite of what akbun-folderview decided, and the difference is what the folder contains.

folderview's data is a library index: a file the user never opens, never edits and would not know what to do with. `%APPDATA%` is exactly right for that, because it is out of the way and backed up with the profile.

Here the folder is the user's recordings. They will open it, drag wav files out of it, copy it to another machine and delete old episodes from it. It is a working folder, not application state. Putting the one file that says which interface to use somewhere else means the folder is not self describing: copying it to another machine carries the takes and leaves the setup behind.

The second reason is that a podcast recorder's settings are worth reading. Which device, which output, where the takes go: those are four lines of json a user can open, check and fix if the app is picking the wrong interface. A path under `Library/Application Support` or `%APPDATA%` is a path most people cannot find.

`settings.json` staying put when the recordings folder moves is the part that needs saying out loud, because the alternative is a loop. If the file lived in the chosen folder, then choosing a new folder would write the setting into the new folder, and the next start would look in the old one, find nothing, fall back to the default, and forget the move. The file has to live at a fixed location for the setting inside it to mean anything.

The write is a temp file and a rename because a crash halfway through a direct write leaves a truncated file, and the next start would silently fall back to the default device. Rename is atomic, so the old file survives until the new one is complete.

A missing or unparseable file is treated as first run rather than an error, and `serde(default)` covers a field added in a later version. Both are the same judgement: a settings file is a convenience, and no state in it is worth refusing to start over.
