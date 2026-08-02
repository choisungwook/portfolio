#!/bin/bash
# PreToolUse — block claude session traces in PR/Issue bodies and commit messages.
# The prompt rule alone loses to the harness default footer, so check again at exec time.
#
# Scope: gh pr/issue create|edit, git commit, and the github MCP write tools.
# Comments are out of scope; the attribution footer belongs there.

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

BODY_PATTERNS='claude\.ai/code|generated with .*claude code|co-authored-by:[[:space:]]*claude|claude-session'
# Commit messages keep Co-Authored-By. Only the session URL and its trailer go.
COMMIT_PATTERNS='claude\.ai/code|claude-session|generated with .*claude code'

report() {
  local target="$1" patterns="$2" text="$3"
  local hits
  hits=$(echo "$text" | grep -niE "$patterns" | head -5)
  [[ -z "$hits" ]] && return 0

  echo "BLOCKED by no-session-trace.sh: claude session trace in $target" >&2
  echo "$hits" >&2
  echo "Remove the claude.ai/code link, the 'Generated with Claude Code' footer, and the Claude-Session trailer, then run it again." >&2
  if [[ "$target" == "commit message" ]]; then
    echo "Co-Authored-By is fine in a commit message. Drop the session URL only." >&2
  else
    echo "Co-Authored-By does not belong in a PR or Issue body either." >&2
  fi
  exit 2
}

# github MCP write tools carry the body as a plain field.
if [[ "$TOOL" == mcp__*github*__* ]]; then
  BODY=$(echo "$INPUT" | jq -r '.tool_input.body // empty')
  report "PR/Issue body" "$BODY_PATTERNS" "$BODY"
  exit 0
fi

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[[ -z "$COMMAND" ]] && exit 0

NORM=$(echo "$COMMAND" | tr -s ' ')

if [[ "$NORM" =~ gh\ (pr|issue)\ (create|edit) ]]; then
  TARGET="PR/Issue body"
  PATTERNS="$BODY_PATTERNS"
  # gh spells it --body-file, -F for short. --file is not a gh flag.
  LONG_FLAG='--body-file'
elif [[ "$NORM" =~ git\ commit ]]; then
  TARGET="commit message"
  PATTERNS="$COMMIT_PATTERNS"
  # git spells it --file, -F for short. --body-file in a commit message is prose.
  LONG_FLAG='--file'
else
  exit 0
fi

# The body usually arrives as a file path, so the command string is not enough.
BODY_FILES=$(
  {
    echo "$COMMAND" | grep -oE -- "$LONG_FLAG[= ]+[^[:space:]]+" | sed -E "s/^$LONG_FLAG[= ]+//"
    echo "$COMMAND" | grep -oE -- '(^|[[:space:]])-F[= ]?[^[:space:]]+' | sed -E 's/^[[:space:]]*-F[= ]?//'
  } | tr -d "\"'"
)

SCAN="$COMMAND"

while IFS= read -r file; do
  [[ -z "$file" ]] && continue

  path="$file"
  [[ -f "$path" ]] || path="${CLAUDE_PROJECT_DIR:-.}/$file"

  if [[ -r "$path" ]]; then
    SCAN="$SCAN"$'\n'"$(cat "$path")"
    continue
  fi

  # An unreadable token is either a real body file the hook must not skip,
  # or the same flag quoted inside prose. Only path-shaped tokens are the former.
  if [[ "$file" == */* ]] || [[ "$file" =~ \.(md|txt|markdown)$ ]] || [[ "$file" == "-" ]]; then
    echo "BLOCKED by no-session-trace.sh: cannot read body file '$file'" >&2
    echo "The hook has to read the body to check it. Pass an absolute path instead of stdin." >&2
    exit 2
  fi
done <<< "$BODY_FILES"

report "$TARGET" "$PATTERNS" "$SCAN"

exit 0
