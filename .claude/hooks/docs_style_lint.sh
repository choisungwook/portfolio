#!/bin/bash
# PostToolUse hook: docs/*.md 편집 시 기계적 문체와 코드블록 설명 누락을 검사해 exit 2로 피드백한다.

command -v jq &>/dev/null || exit 0
command -v python3 &>/dev/null || exit 0

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[[ -z "$FILE_PATH" ]] && exit 0
[[ -f "$FILE_PATH" ]] || exit 0

# docs/*.md만 검사하고 .claude, .github, knowledge, templates는 제외한다.
[[ "$FILE_PATH" =~ (^|/)docs/[^/]+\.md$ ]] || exit 0
if [[ "$FILE_PATH" =~ (^|/)\.(claude|github)/ ]] || [[ "$FILE_PATH" =~ (^|/)(knowledge|templates)/ ]]; then
  exit 0
fi

python3 - "$FILE_PATH" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines()

errors = []
fence_char = None
fence_len = 0
prev_non_empty = ""

fence_re = re.compile(r"^(`{3,}|~{3,})(.*)$")
list_item_re = re.compile(r"^(?:[-*+]|\d+\.)\s+")
cliche_re = re.compile(
    r"(다음 명령어?를 실행합니다\.?|하는 것이 가능합니다|에 대해 알아보겠습니다)"
)
# 산문 문단에서 개조식 종결(-함/-임/-됨/-음)을 탐지한다. 흔한 명사 끝말은 오탐 방지를 위해 제외한다.
nominal_end_re = re.compile(r"[가-힣](?:함|임|됨|음)\.?$")
noun_allow_re = re.compile(r"(?:포함|다음|처음|마음|모음|묶음|이름)\.?$")

for idx, raw in enumerate(lines, start=1):
    stripped = raw.strip()

    fence_match = fence_re.match(stripped)
    if fence_match:
        marker = fence_match.group(1)
        rest = fence_match.group(2).strip()
        if fence_char is None:
            if prev_non_empty.startswith("#"):
                errors.append(
                    f"L{idx}: 코드블록/다이어그램 바로 위에 설명 문장이 없음 (헤더 바로 아래 단독 배치)"
                )
            fence_char = marker[0]
            fence_len = len(marker)
        elif marker[0] == fence_char and len(marker) >= fence_len and not rest:
            fence_char = None
            fence_len = 0
            prev_non_empty = stripped
        continue

    if fence_char is not None:
        continue

    if not stripped:
        continue

    is_structural = (
        stripped.startswith("|")
        or stripped.startswith("#")
        or stripped.startswith(">")
        or bool(list_item_re.match(stripped))
    )

    if not is_structural:
        if cliche_re.search(stripped):
            errors.append(
                f"L{idx}: 기계적 상투어/직역투 감지 -> 구체적 목적·동작으로 서술 ({stripped[:60]})"
            )
        if nominal_end_re.search(stripped) and not noun_allow_re.search(stripped):
            errors.append(
                f"L{idx}: 단문 개조식 종결(~함/~임/~됨/~음) 감지 -> 완결된 '합니다'체 문장으로 서술 ({stripped[:60]})"
            )

    prev_non_empty = stripped

if errors:
    sys.stderr.write(
        f"[docs-style-lint] {path} 에서 문서 스타일 위반 {len(errors)}건 발견 "
        "(.claude/rules/markdown.md, .claude/rule-details/docs.md 참고):\n"
    )
    for err in errors[:10]:
        sys.stderr.write(f"  - {err}\n")
    if len(errors) > 10:
        sys.stderr.write(f"  ... 외 {len(errors) - 10}건\n")
    sys.exit(2)
PY
