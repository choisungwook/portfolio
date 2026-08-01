# Electron in plain JavaScript, built for Windows on a Windows runner

## Decision

Build the app on Electron in plain JavaScript with no build step, and produce the Windows installer on a `windows-latest` runner rather than cross compiling from a development machine. Keep the source free of Windows-only code everywhere except the updater.

## Reason

The app is a grid of thumbnails, a tree, a search box and a few dialogs. That is a layout problem, and HTML and CSS are the shortest way to a scrollable two panel sidebar next to a responsive grid. A native Windows toolkit would buy a smaller binary and a faster start, and would cost a rewrite of the part that is almost entirely layout.

Plain JavaScript rather than TypeScript is the same trade seen from the other side. TypeScript earns its build step when there are many modules with shared shapes crossing between them. Here there are five source files and one shape, the entry, and it is written out at the top of `library.js`. Adding `tsc` would add a compile to every run and every test for a type that fits in a comment.

The Windows build had a real choice in it, because nobody working on this has released for Windows before. Cross compiling an NSIS installer from macOS is possible with Wine, and it produces an artifact nobody can run before shipping it. A `windows-latest` runner builds on the real platform, runs the tests there as well, and the only thing that ever has to be Windows is the runner. That also means the batch script in the updater is executed by CI on every release rather than trusted by reading.

Keeping everything but the updater platform neutral is what makes `npm start` work on macOS. The window can be worked on without a Windows machine, which is how the layout was checked while writing this. That is a development convenience and not a supported target: no job builds a macOS or Linux artifact, and [the library and the updater](./2026-08-update-installer-silent-run.md) are the parts that would need real work to make one.
