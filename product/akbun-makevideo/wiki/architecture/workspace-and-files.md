# The workspace, and what is never copied

## The rule

**Importing media references it. It never copies it.**

A project holds absolute paths to files wherever the user actually keeps them — an external drive, a Photos export, a folder on the desktop. Nothing is copied into the project folder, at import, at save, or at render.

This is the invariant most likely to be broken by a well meant change ("wouldn't it be tidier if the project were self contained?"), so it is written down here and there is a test for it: `crates/render/src/workspace.rs::a_project_points_at_media_where_it_really_lives` fails the moment a save starts rewriting media paths.

Why it is this way:

- Video files are large. Copying a 40 GB shoot into a project folder to trim thirty seconds out of it is not tidiness, it is a full disk.
- The same footage is usually used by more than one project.
- A copy is a second thing that can drift. The file the user edits and the file they see in Finder should be the same file.

What it costs, and this is a real cost: **moving or deleting media breaks the project.** A clip whose asset path no longer resolves is drawn with a red hatched pattern in the timeline (`.clip.missing`) and is skipped by the render rather than failing it. There is no relink dialog yet; that is the obvious next feature, and it is a feature rather than a fix because the behaviour above is the intended one.

## The workspace folder

Set in Settings → Preview & Tools. Empty means the default:

```text
~/Documents/akbun-makevideo/
```

Rust resolves it in `workspace_root()`: the setting if there is one, otherwise the platform Documents folder, otherwise the home folder. The page never guesses — `bootstrap` returns the resolved path so Settings and the New Project sheet can show where things will actually go.

## A project is a folder

```text
~/Documents/akbun-makevideo/
  summer trip/
    project.akbunvideo      the edit: settings, asset paths, tracks, clips
    summer-trip-fhd.mp4     wherever the user pointed the render, defaulting here
  another edit/
    project.akbunvideo
```

- **New Project** asks for a name, not for a place to save a file. It makes the folder and writes the project file immediately, because a folder with nothing in it would not show up in Open and would look like the project was never created.
- **Open Project** lists the folders under the workspace root that contain a `project.akbunvideo`, newest first. Anything else in the workspace folder is somebody else's and is left alone. **Browse…** is the escape hatch for a project file kept somewhere else.
- **Renders** default to the project folder, so an edit and what came out of it end up together. The save dialog still lets them go anywhere.
- The window title and the menu bar show the **folder** name, not the file name — every project file is called `project.akbunvideo`, so the file name carries no information. A `.akbunvideo` opened through Browse is named by its file instead, because its folder belongs to something else.

## Naming

`workspace::sanitize_project_name` decides what a project may be called, and it **rejects rather than rewrites**: quietly turning `../../etc` into `etcetc` would make a project the user did not ask for under a name they did not choose.

Refused: empty, over 80 characters, anything with `/` or `\`, a leading dot, a trailing dot or space (Windows drops those silently, so the project would reopen under a different name), the characters `:*?"<>|`, control characters, and the Windows reserved device names. macOS does not care about most of these; a project folder that will not survive being copied to a Windows machine is still worth refusing at the point it is named.
