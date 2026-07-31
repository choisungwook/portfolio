# akbun-screenshot

macOS menu bar app for area screenshots. Drag to select, the capture lands on the clipboard, and a floating preview in the bottom-left corner lets you save it as png or discard it. The menu bar icon also carries Check for Updates, which pulls the newest dmg from GitHub Releases and replaces the app in place.

## Directory layout

| Directory | Description |
|---|---|
| `workspace/` | App source code and build config. Development happens here |
| `wiki/` | Project notes the next agent reads before taking over |
| `adr/` | Architecture decision records |

## Quick start

Install dependencies and launch the app:

```bash
cd workspace
npm install
npm start
```

macOS asks for Screen Recording permission on the first capture. Grant it in System Settings > Privacy & Security > Screen Recording, then trigger the capture again.
