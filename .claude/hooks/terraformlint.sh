#!/bin/bash
# Auto-fix → fallback warn (never block)

command -v terraform &>/dev/null || exit 0

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" =~ \.(tf|hcl)$ ]] && [[ -f "$FILE_PATH" ]]; then
  terraform fmt -write=true "$FILE_PATH" 2>&1 || true

  DIR=$(dirname "$FILE_PATH")
  if [[ -d "$DIR/.terraform" ]]; then
    if ! terraform -chdir="$DIR" validate 2>&1; then
      echo "WARNING: terraform validate failed for $FILE_PATH (skip, never block)"
    fi
  fi
fi

exit 0
