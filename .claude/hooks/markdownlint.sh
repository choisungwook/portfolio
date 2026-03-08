#!/bin/bash

command -v markdownlint &>/dev/null || exit 0

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" =~ \.md$ ]] && [[ -f "$FILE_PATH" ]]; then
  markdownlint -f "$FILE_PATH" 2>&1
fi

exit 0
