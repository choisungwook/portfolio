"""product/ 디렉터리 목록과 인덱스 3곳이 일치하는지 본다.

products.json은 products.akbun.com이 직접 읽으므로 빠지면 사이트가 낡는다.
"""

import json
import re

from common import REPO_ROOT, Report

PRODUCT_DIR = REPO_ROOT / "product"


def product_dirs() -> set[str]:
  """product/ 바로 아래 디렉터리 이름."""
  return {entry.name for entry in PRODUCT_DIR.iterdir() if entry.is_dir()}


def catalog_ids() -> set[str]:
  """products.json의 id 목록."""
  catalog = json.loads((PRODUCT_DIR / "products.json").read_text(encoding="utf-8"))
  return {product["id"] for product in catalog["products"]}


def linked_dirs(markdown_path: str, link_prefix: str) -> set[str]:
  """Markdown 파일에서 link_prefix로 시작하는 링크가 가리키는 디렉터리 이름."""
  text = (REPO_ROOT / markdown_path).read_text(encoding="utf-8")
  return set(re.findall(r"\]\(" + re.escape(link_prefix) + r"([^/)]+)/[^)]*\)", text))


def compare(expected: set[str], listed: set[str], path: str, report: Report) -> None:
  """빠진 항목과 디렉터리가 없는 항목을 각각 보고한다."""
  for name in sorted(expected - listed):
    report.add(path, f"product/{name} 항목이 없음. 디렉터리 링크와 한 문장 설명을 추가할 것")
  for name in sorted(listed - expected):
    report.add(path, f"{name} 항목이 가리키는 product/{name} 디렉터리가 없음. 항목을 지우거나 이름을 고칠 것")


def main() -> None:
  """인덱스 3곳을 디렉터리 목록과 대조한다."""
  report = Report()
  expected = product_dirs()
  compare(expected, catalog_ids(), "product/products.json", report)
  compare(expected, linked_dirs("product/README.md", "./"), "product/README.md", report)
  compare(expected, linked_dirs("README.md", "./product/"), "README.md", report)
  report.exit()


if __name__ == "__main__":
  main()
