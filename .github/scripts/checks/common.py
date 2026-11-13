"""검사 스크립트가 함께 쓰는 출력과 git 호출."""

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


class Report:
  """finding을 GitHub annotation 형식으로 출력하고 종료 코드를 정한다."""

  def __init__(self, warn_only: bool = False) -> None:
    self.warn_only = warn_only
    self.count = 0

  def add(self, path: str, message: str, line: int | None = None) -> None:
    """finding 하나를 출력한다. 메시지에는 고치는 방법을 함께 적는다."""
    level = "warning" if self.warn_only else "error"
    location = f"file={path}" + (f",line={line}" if line else "")
    print(f"::{level} {location}::{message}")
    self.count += 1

  def exit(self) -> None:
    """--warn이 아니고 finding이 있으면 1로 끝낸다."""
    sys.exit(0 if self.warn_only or self.count == 0 else 1)


def parse_file_args(description: str) -> tuple[list[str], Report]:
  """파일 단위 검사의 공통 인자(파일 목록, --warn)를 읽는다."""
  parser = argparse.ArgumentParser(description=description)
  parser.add_argument("files", nargs="*")
  parser.add_argument("--warn", action="store_true", help="실패 대신 경고로만 출력")
  args = parser.parse_args()
  return args.files, Report(warn_only=args.warn)


def git(*args: str) -> str:
  """저장소 루트에서 git을 실행하고 stdout을 돌려준다. 실패하면 빈 문자열이다."""
  result = subprocess.run(["git", *args], cwd=REPO_ROOT, capture_output=True, text=True, check=False)
  return result.stdout if result.returncode == 0 else ""
