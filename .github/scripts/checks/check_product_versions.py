"""release workflow를 깨우는 변경이 있는데 버전이 그대로인 PR을 찾는다.

버전을 안 올리면 PR은 통과하고 머지 후 release job에서만 실패하거나,
같은 버전으로 다시 빌드되어 설치본에 업데이트가 전달되지 않는다.
workflow마다 버전 위치와 tag 형식이 달라 product-versions.json에 적어 둔다.
"""

import argparse
import fnmatch
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml

from common import REPO_ROOT, Report, git

CONFIG_PATH = Path(__file__).with_name("product-versions.json")
WORKFLOW_DIR = REPO_ROOT / ".github" / "workflows"
CONFIG_LABEL = ".github/scripts/checks/product-versions.json"


def push_paths(workflow: Path) -> list[str]:
  """workflow의 on.push.paths를 돌려준다. push 트리거가 없으면 빈 목록이다."""
  document = yaml.safe_load(workflow.read_text(encoding="utf-8")) or {}
  triggers = document.get("on", document.get(True)) or {}
  push = triggers.get("push") if isinstance(triggers, dict) else None
  return (push or {}).get("paths") or []


def matches(path: str, pattern: str) -> bool:
  """GitHub Actions paths 필터와 같은 방식으로 경로를 대조한다."""
  if pattern.endswith("/**"):
    return path.startswith(pattern[:-2])
  return fnmatch.fnmatch(path, pattern)


def parse_version(file_name: str, content: str) -> str:
  """버전 파일 종류에 맞게 버전 문자열을 꺼낸다."""
  if file_name == "package.json":
    return str(json.loads(content).get("version", ""))
  if file_name == "Cargo.toml":
    found = re.search(r'^version\s*=\s*"([^"]+)"', content, re.MULTILINE)
    return found.group(1) if found else ""
  if file_name.endswith(".xml"):
    return (ET.fromstring(content).findtext("./information/version") or "").strip()
  return content.strip()


def version_at(revision: str, version_file: str) -> str:
  """해당 revision의 버전을 읽는다. 파일이 없으면 빈 문자열이다."""
  content = git("show", f"{revision}:{version_file}")
  return parse_version(Path(version_file).name, content) if content else ""


def version_key(version: str) -> tuple[int, ...]:
  """1.10.0이 1.9.0보다 크도록 숫자로 비교할 키를 만든다."""
  return tuple(int(number) for number in re.findall(r"\d+", version))


def needs_bump(touched: list[str], existing_tag: str) -> bool:
  """문서와 workflow만 바뀐 경우는 tag 중복으로 release가 실패하는 workflow만 버전을 요구한다."""
  ships_nothing = all(path.endswith(".md") or path.startswith(".github/") for path in touched)
  return existing_tag == "fail" or not ships_nothing


def check_workflow(name: str, entry: dict, changed: list[str], base: str, head: str, report: Report) -> None:
  """workflow 하나에 대해 버전 올림과 tag 중복을 검사한다."""
  patterns = push_paths(WORKFLOW_DIR / name)
  touched = [path for path in changed if any(matches(path, pattern) for pattern in patterns)]
  if not touched or not needs_bump(touched, entry["existing_tag"]):
    return
  version_file = entry["version_file"]
  old, new = version_at(base, version_file), version_at(head, version_file)
  tag = f"{entry['tag_prefix']}{new}"
  if old and version_key(new) <= version_key(old):
    report.add(version_file, f"{touched[0]} 등 {len(touched)}개 파일이 {name}을 실행시키는데 버전이 {old} 그대로임. patch나 minor를 올릴 것")
  elif git("tag", "--list", tag).strip():
    report.add(version_file, f"tag {tag}가 이미 있음. 머지하면 release가 새 버전을 만들지 못하므로 버전을 올릴 것")


def check_coverage(config: dict, report: Report) -> None:
  """product를 release하는 workflow가 설정 파일에서 빠지지 않았는지 본다."""
  for workflow in sorted(WORKFLOW_DIR.glob("*.y*ml")):
    releases_product = any(pattern.startswith("product/") for pattern in push_paths(workflow))
    if releases_product and workflow.name not in config:
      report.add(f".github/workflows/{workflow.name}", f"{CONFIG_LABEL}에 이 workflow가 없음. version_file, tag_prefix, existing_tag를 등록할 것")
  for name in config:
    if not (WORKFLOW_DIR / name).is_file():
      report.add(CONFIG_LABEL, f"{name}이 .github/workflows/에 없음. 이름이 바뀌었으면 키를 고칠 것")


def main() -> None:
  """base와 head 사이에 바뀐 파일로 모든 release workflow를 검사한다."""
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--base", required=True)
  parser.add_argument("--head", default="HEAD")
  args = parser.parse_args()
  report = Report()
  config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
  check_coverage(config, report)
  merge_base = git("merge-base", args.base, args.head).strip() or args.base
  changed = git("diff", "--name-only", merge_base, args.head).splitlines()
  for name, entry in config.items():
    if "version_file" in entry and (WORKFLOW_DIR / name).is_file():
      check_workflow(name, entry, changed, merge_base, args.head, report)
  report.exit()


if __name__ == "__main__":
  main()
