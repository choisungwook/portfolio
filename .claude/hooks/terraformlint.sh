#!/bin/bash

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" =~ \.(tf|hcl)$ ]] && [[ -f "$FILE_PATH" ]]; then
  /opt/homebrew/bin/terraform fmt "$FILE_PATH" 2>&1

  DIR=$(dirname "$FILE_PATH")
  if [[ -d "$DIR/.terraform" ]]; then
    /opt/homebrew/bin/terraform -chdir="$DIR" validate 2>&1
  fi
fi

exit 0
