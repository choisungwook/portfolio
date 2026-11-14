"""manifests/ 아래 YAML이 .claude/rule-details/kubernetes.md의 기계 판정 가능한 규칙을 지키는지 본다.

Helm 템플릿처럼 YAML로 읽을 수 없는 파일은 건너뛴다.
"""

import re
from pathlib import Path

import yaml

from common import REPO_ROOT, Report, parse_file_args

FILE_NAME = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*\.ya?ml$")
TOP_LEVEL_ORDER = ["apiVersion", "kind", "metadata", "spec"]


def is_manifest(path: str) -> bool:
  """manifests/ 디렉터리 아래의 YAML 파일인지 판정한다."""
  return "manifests" in Path(path).parts[:-1] and path.endswith((".yaml", ".yml"))


def load_documents(path: str) -> list[dict] | None:
  """YAML 문서 목록을 읽는다. 읽을 수 없으면 None이다."""
  try:
    documents = list(yaml.safe_load_all((REPO_ROOT / path).read_text(encoding="utf-8")))
  except (yaml.YAMLError, UnicodeDecodeError):
    return None
  return [document for document in documents if isinstance(document, dict)]


def find_containers(node: object) -> list[dict]:
  """문서 어디에 있든 containers와 initContainers 항목을 모은다."""
  if isinstance(node, list):
    return [found for item in node for found in find_containers(item)]
  if not isinstance(node, dict):
    return []
  found = [item for key in ("containers", "initContainers") for item in node.get(key) or [] if isinstance(item, dict)]
  return found + [inner for value in node.values() for inner in find_containers(value)]


def check_document(path: str, document: dict, report: Report) -> None:
  """리소스 하나의 키 순서, label, container resources를 본다."""
  present = [key for key in document if key in TOP_LEVEL_ORDER]
  if present != [key for key in TOP_LEVEL_ORDER if key in document]:
    report.add(path, "최상위 키를 apiVersion, kind, metadata, spec 순서로 쓸 것")
  if document.get("kind") not in (None, "Kustomization") and not (document.get("metadata") or {}).get("labels"):
    report.add(path, "metadata.labels에 리소스를 식별할 label을 넣을 것")
  for container in find_containers(document.get("spec")):
    resources = container.get("resources") or {}
    if not resources.get("limits") or not resources.get("requests"):
      report.add(path, f"container {container.get('name', '?')}에 resources.limits와 resources.requests를 명시할 것")


def check_file(path: str, report: Report) -> None:
  """manifest 파일 하나를 검사한다."""
  if not FILE_NAME.match(Path(path).name):
    report.add(path, "파일 이름은 소문자와 하이픈으로 쓸 것. 예: nginx-deployment.yaml")
  documents = load_documents(path)
  if documents is None:
    return
  if len(documents) > 1:
    report.add(path, f"리소스 {len(documents)}개가 한 파일에 있음. 파일 하나에 리소스 하나만 둘 것")
  for document in documents:
    check_document(path, document, report)


def main() -> None:
  """인자로 받은 파일 중 manifest만 검사한다."""
  files, report = parse_file_args(__doc__)
  for path in files:
    if is_manifest(path) and (REPO_ROOT / path).is_file():
      check_file(path, report)
  report.exit()


if __name__ == "__main__":
  main()
