# Keep one library per volume UUID

## Decision

Store roots, entries and their metadata under the Windows Volume GUID rather than treating an absolute path as the device identity. Validate the current Volume GUID before every operation and include it in thumbnail cache keys.

Migrate the old path-only `library.json` to schema version 2 on startup. Keep an exact `library.v1.json` backup and leave data for disconnected devices in the `legacy` section until that device is available.

## Reason

Windows can reuse the same drive letter after one removable drive is unplugged and another is attached. A path such as `E:\photos\a.jpg` therefore identifies a location, not the storage device that owns the user's roots, tags and ratings. Reusing that path against another drive can display the wrong library and can apply rename or delete to the wrong file.

The Volume GUID remains tied to the volume independently of its USB port and drive letter. Keeping a separate library under each GUID makes an unplugged device inactive without deleting its state, and changing the drive letter only requires rebasing that device's paths.

The old format has no device identifier. Migration uses matching file size, modification time and kind before assigning a populated root to the currently mounted volume. If the device is absent or the fingerprint does not match, retaining the legacy data is safer than assigning it to a different drive.
