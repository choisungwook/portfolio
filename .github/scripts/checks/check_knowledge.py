"""knowledge/ concept의 frontmatter, 파일 이름, index 등재를 본다.

기준은 .claude/rules/knowledge.md다. templates/knowledge/는 형식 템플릿이라 검사하지 않는다.
"""

import re
from pathlib import Path

import yaml

from common import REPO_ROOT, Report, parse_file_args

TYPES = {"Decision", "Playbook", "Topic", "Reference"}
RESERVED = {"index.md", "log.md"}
NAME = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*\.md$")
DECISION_NAME = re.compile(r"^\d{4}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*\.md$")


def is_concept(path: str) -> bool:
  """knowledge 번들 안의 concept 파일인지 판정한다."""
  parts = Path(path).parts
  in_bundle = "knowledge" in parts and not path.startswith("templates/")
  return in_bundle and path.endswith(".md") and parts[-1] not in RESERVED


def frontmatter(text: str) -> dict | None:
  """YAML frontmatter를 읽는다. 없거나 형식이 틀리면 None이다."""
  found = re.match(r"^---\n(.*?)\n---\s*\n", text, re.DOTALL)
  if not found:
    return None
  try:
    loaded = yaml.safe_load(found.group(1))
  except yaml.YAMLError:
    return None
  return loaded if isinstance(loaded, dict) else None


def check_name(path: str, report: Report) -> None:
  """파일 이름 형식을 본다. decision은 YYYY-MM-<주제>.md다."""
  name, parent = Path(path).name, Path(path).parent.name
  if parent == "decisions" and not DECISION_NAME.match(name):
    report.add(path, "decision 파일 이름은 YYYY-MM-<주제>.md 형식(소문자, 하이픈)으로 쓸 것")
  elif parent != "decisions" and parent != "references" and not NAME.match(name):
    report.add(path, "파일 이름은 소문자와 하이픈으로 쓸 것")


def check_index(path: str, report: Report) -> None:
  """같은 디렉터리의 index.md가 이 concept를 링크하는지 본다. 없으면 번들 루트의 index.md를 본다."""
  directory = (REPO_ROOT / path).parent
  index = directory / "index.md" if (directory / "index.md").is_file() else directory.parent / "index.md"
  if not index.is_file() or Path(path).name not in index.read_text(encoding="utf-8"):
    report.add(path, f"{index.relative_to(REPO_ROOT)} 목록에 이 파일 항목을 추가할 것")


def check_file(path: str, report: Report) -> None:
  """concept 하나를 검사한다."""
  meta = frontmatter((REPO_ROOT / path).read_text(encoding="utf-8", errors="replace"))
  if meta is None:
    report.add(path, "YAML frontmatter가 없음. --- 사이에 type, title, description을 적을 것", line=1)
  elif meta.get("type") not in TYPES:
    report.add(path, f"type은 {', '.join(sorted(TYPES))} 중 하나여야 함", line=1)
  check_name(path, report)
  check_index(path, report)


def main() -> None:
  """인자로 받은 파일 중 concept만 검사한다."""
  files, report = parse_file_args(__doc__)
  for path in files:
    if is_concept(path) and (REPO_ROOT / path).is_file():
      check_file(path, report)
  report.exit()


if __name__ == "__main__":
  main()
