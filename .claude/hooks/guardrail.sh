#!/bin/bash
# PreToolUse Bash guardrail — block accidental destructive rm patterns.
# git operations are intentionally NOT blocked here.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

NORM=$(echo "$COMMAND" | tr -s ' ')

BLOCK=(
  'rm -[rRfF]+ /[[:space:]]*$'
  'rm -[rRfF]+ /\*'
  'rm -[rRfF]+ ~[[:space:]]*$'
  'rm -[rRfF]+ ~/'
  'rm -[rRfF]+ \$HOME'
  'rm -[rRfF]+ \.[[:space:]]*$'
  'rm -[rRfF]+ \./[[:space:]]*$'
  'rm -[rRfF]+ \*[[:space:]]*$'
)

for pat in "${BLOCK[@]}"; do
  if [[ "$NORM" =~ $pat ]]; then
    echo "BLOCKED by guardrail.sh: '$COMMAND'" >&2
    echo "Pattern matched: '$pat'" >&2
    echo "If this is intentional, run it from a separate shell outside Claude Code." >&2
    exit 2
  fi
done

exit 0
