"""product workflow의 파일 이름이 <release|verify|deploy>-<product 디렉터리>.yml인지 본다.

이름 형식이 섞이면 다음에 만드는 workflow가 어긋난 이름을 따라 한다.
"""

import re

import yaml

from common import REPO_ROOT, Report

WORKFLOW_DIR = REPO_ROOT / ".github" / "workflows"
PREFIXES = ("release", "verify", "deploy")


def trigger_paths(document: dict) -> list[str]:
  """push와 pull_request 트리거의 paths를 합친다."""
  triggers = document.get("on", document.get(True)) or {}
  if not isinstance(triggers, dict):
    return []
  events = [triggers.get("push") or {}, triggers.get("pull_request") or {}]
  return [path for event in events for path in event.get("paths") or []]


def product_of(paths: list[str]) -> str | None:
  """paths가 가리키는 product 디렉터리 이름. product workflow가 아니면 None이다."""
  for path in paths:
    found = re.match(r"product/([^/*]+)/", path)
    if found:
      return found.group(1)
  return None


def main() -> None:
  """모든 workflow의 파일 이름과 name 필드를 검사한다."""
  report = Report()
  for workflow in sorted(WORKFLOW_DIR.glob("*.y*ml")):
    document = yaml.safe_load(workflow.read_text(encoding="utf-8")) or {}
    product = product_of(trigger_paths(document))
    if product is None:
      continue
    path = f".github/workflows/{workflow.name}"
    allowed = [f"{prefix}-{product}.yml" for prefix in PREFIXES]
    if workflow.name not in allowed:
      report.add(path, f"파일 이름을 {' | '.join(allowed)} 중 하나로 바꿀 것. product-versions.json의 키도 함께 고칠 것")
    elif document.get("name") != workflow.stem:
      report.add(path, f"name 필드를 파일 이름과 같은 {workflow.stem}으로 맞출 것", line=1)
  report.exit()


if __name__ == "__main__":
  main()
