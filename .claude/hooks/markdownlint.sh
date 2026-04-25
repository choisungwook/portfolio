#!/bin/bash
# Auto-fix → fallback warn (never block)

command -v markdownlint &>/dev/null || exit 0

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" =~ \.md$ ]] && [[ -f "$FILE_PATH" ]]; then
  OUTPUT=$(markdownlint --fix "$FILE_PATH" 2>&1)
  STATUS=$?

  if [[ $STATUS -ne 0 ]]; then
    echo "WARNING: markdownlint could not auto-fix some rules in $FILE_PATH (skip, never block)"
    echo "$OUTPUT" | head -5
  fi
fi

exit 0
