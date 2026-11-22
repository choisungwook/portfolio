#!/bin/bash
# Antigravity PreToolUse(run_command) 어댑터.
# 심볼릭 링크(.agents/hooks/claude-hooks -> ../../.claude/hooks)를 통해
# 공용 명령, 커밋, 게시 검사를 실행하고
# 결과를 Antigravity JSON 계약({"decision": "allow"|"deny", "reason": ...})으로 반환한다.
set -o pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
CLAUDE_HOOKS_DIR="$SCRIPT_DIR/claude-hooks"

deny() {
  local reason="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -cn --arg reason "$reason" '{"decision":"deny","reason":$reason}'
  else
    printf '{"decision":"deny","reason":"%s"}\n' "Hook blocked command (jq not installed)."
  fi
  exit 0
}

allow() {
  printf '{"decision":"allow"}\n'
  exit 0
}

command -v jq >/dev/null 2>&1 || deny "jq is not installed, so pre-tool safety checks cannot run."

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.toolCall.args.CommandLine // empty') || deny "Failed to parse Antigravity PreToolUse input."
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')

[ -z "$COMMAND" ] && allow

# Claude Code PreToolUse(Bash) stdin 형식으로 변환
CLAUDE_PAYLOAD=$(jq -cn --arg cmd "$COMMAND" --arg cwd "$CWD" '{"tool_input":{"command":$cmd},"cwd":$cwd}')

run_claude_hook() {
  local script="$1"
  local stderr_file
  stderr_file=$(mktemp)
  printf '%s' "$CLAUDE_PAYLOAD" | bash "$script" >/dev/null 2>"$stderr_file"
  local rc=$?
  local err_msg
  err_msg=$(cat "$stderr_file")
  rm -f "$stderr_file"
  if [ "$rc" -ne 0 ]; then
    [ -z "$err_msg" ] && err_msg="Blocked by $(basename "$script") (exit $rc)"
    deny "$err_msg"
  fi
}

run_claude_hook "$CLAUDE_HOOKS_DIR/guardrail.sh"
run_claude_hook "$CLAUDE_HOOKS_DIR/require-commit-hooks.sh"
run_claude_hook "$CLAUDE_HOOKS_DIR/prepush-scan.sh"

allow
