"""Markdown 상대 링크가 가리키는 파일이 있는지 본다.

외부 URL은 보지 않는다. knowledge/ concept는 아직 없는 concept를 링크해도 되므로 검사하지 않는다.
"""

import re
from pathlib import Path
from urllib.parse import unquote

from common import REPO_ROOT, Report, parse_file_args

LINK = re.compile(r"(?<!\\)\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
SKIP_PREFIXES = ("http://", "https://", "mailto:", "#", "data:", "tel:")


def prose_lines(text: str) -> list[tuple[int, str]]:
  """코드블록과 inline code를 뺀 줄을 줄 번호와 함께 돌려준다."""
  lines, fenced = [], False
  for number, line in enumerate(text.splitlines(), start=1):
    if line.lstrip().startswith(("```", "~~~")):
      fenced = not fenced
    elif not fenced:
      lines.append((number, re.sub(r"`[^`]*`", "", line)))
  return lines


def resolve(source: Path, target: str) -> Path:
  """링크 대상을 파일 경로로 바꾼다. /로 시작하면 저장소 루트 기준이다."""
  clean = unquote(target.split("#")[0].split("?")[0])
  if clean.startswith("/"):
    return REPO_ROOT / clean.lstrip("/")
  return source.parent / clean


def check_file(path: str, report: Report) -> None:
  """파일 하나의 상대 링크를 모두 확인한다."""
  source = REPO_ROOT / path
  for number, line in prose_lines(source.read_text(encoding="utf-8", errors="replace")):
    for target in LINK.findall(line):
      if target.startswith(SKIP_PREFIXES) or any(char in target for char in "{<["):
        continue
      if not resolve(source, target).exists():
        report.add(path, f"링크 대상 {target}이 없음. 경로를 고치거나 링크를 지울 것", line=number)


def main() -> None:
  """인자로 받은 Markdown 파일을 검사한다."""
  files, report = parse_file_args(__doc__)
  for path in files:
    if "/knowledge/" not in f"/{path}" and (REPO_ROOT / path).is_file():
      check_file(path, report)
  report.exit()


if __name__ == "__main__":
  main()
