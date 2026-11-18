"""저장 위치와 프로젝트 이름을 정한다."""

import os
from pathlib import Path

MAX_FIELD_CHARS = 2000
CONTEXT_OBSERVATION_LIMIT = 20
CONTEXT_MAX_CHARS = 9000


def minimem_home() -> Path:
  """데이터 디렉터리를 반환한다. MINIMEM_HOME이 없으면 ~/.minimem을 쓴다."""
  return Path(os.environ.get("MINIMEM_HOME", Path.home() / ".minimem"))


def db_path() -> Path:
  """SQLite 파일 경로를 반환한다."""
  return minimem_home() / "memory.db"


def project_name(cwd: str) -> str:
  """작업 디렉터리 이름을 프로젝트 키로 쓴다."""
  return Path(cwd).resolve().name


def is_disabled() -> bool:
  """observer가 띄운 claude 세션처럼 기록하면 안 되는 프로세스인지 확인한다."""
  return os.environ.get("MINIMEM_DISABLE") == "1"
