#!/bin/bash
# 편집한 파일에 저장소 규칙 검사를 돌려 고칠 것을 바로 알려 준다 (warn only, never block).
# 같은 검사가 verify-pull-request.yml에서는 PR을 실패시킨다.

python3 -c 'import yaml' 2>/dev/null || exit 0

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[[ -f "$FILE_PATH" ]] || exit 0
RELATIVE=${FILE_PATH#"$REPO_ROOT"/}
CHECKS="$REPO_ROOT/.github/scripts/checks"

case "$RELATIVE" in
  *.tf) python3 "$CHECKS/check_terraform.py" --warn "$RELATIVE" ;;
  *.yaml|*.yml) python3 "$CHECKS/check_manifests.py" --warn "$RELATIVE" ;;
  *.md)
    python3 "$CHECKS/check_markdown_links.py" --warn "$RELATIVE"
    python3 "$CHECKS/check_knowledge.py" --warn "$RELATIVE"
    ;;
esac

exit 0
