#!/bin/bash
# Auto-fix → fallback warn (never block)

command -v markdownlint &>/dev/null || exit 0

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" =~ \.md$ ]] && [[ -f "$FILE_PATH" ]]; then
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
  CONFIG="$REPO_ROOT/.markdownlint.json"

  if [[ -f "$CONFIG" ]]; then
    OUTPUT=$(markdownlint --config "$CONFIG" --fix "$FILE_PATH" 2>&1)
  else
    OUTPUT=$(markdownlint --fix "$FILE_PATH" 2>&1)
  fi

  STATUS=$?

  if [[ $STATUS -ne 0 ]]; then
    echo "WARNING: markdownlint could not auto-fix some rules in $FILE_PATH (skip, never block)"
    echo "$OUTPUT" | head -5
  fi
fi

exit 0
