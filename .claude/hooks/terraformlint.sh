#!/bin/bash

command -v terraform &>/dev/null || exit 0

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" =~ \.(tf|hcl)$ ]] && [[ -f "$FILE_PATH" ]]; then
  terraform fmt "$FILE_PATH" 2>&1

  DIR=$(dirname "$FILE_PATH")
  if [[ -d "$DIR/.terraform" ]]; then
    terraform -chdir="$DIR" validate 2>&1
  fi
fi

exit 0
