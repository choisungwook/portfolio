from dataclasses import dataclass
import importlib.util
import json
from pathlib import Path
from typing import Callable


ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Case:
  name: str
  path: str
  expected: bool


@dataclass(frozen=True)
class Failure:
  case: Case
  actual: bool


@dataclass(frozen=True)
class GateResult:
  total: int
  failures: tuple[Failure, ...]

  @property
  def passed(self) -> int:
    return self.total - len(self.failures)

  @property
  def is_success(self) -> bool:
    return not self.failures


def load_cases(path: Path) -> tuple[Case, ...]:
  rows = json.loads(path.read_text(encoding="utf-8"))
  return tuple(Case(**row) for row in rows)


def load_candidate() -> Callable[[str], bool]:
  path = ROOT / "candidate" / "path_policy.py"
  spec = importlib.util.spec_from_file_location("candidate_path_policy", path)
  if spec is None or spec.loader is None:
    raise RuntimeError(f"cannot load candidate: {path}")
  module = importlib.util.module_from_spec(spec)
  spec.loader.exec_module(module)
  return module.is_safe_repo_path


def score_cases(
  candidate: Callable[[str], bool],
  cases: tuple[Case, ...],
) -> GateResult:
  failures: list[Failure] = []
  for case in cases:
    actual = candidate(case.path)
    if actual != case.expected:
      failures.append(Failure(case=case, actual=actual))
  return GateResult(total=len(cases), failures=tuple(failures))


def evaluate(path: Path) -> GateResult:
  return score_cases(load_candidate(), load_cases(path))


def failure_report(result: GateResult) -> str:
  lines = [f"TRAIN: {result.passed}/{result.total} passed"]
  for failure in result.failures:
    lines.append(
      f"- {failure.case.name}: path={failure.case.path!r}, "
      f"expected={failure.case.expected}, actual={failure.actual}"
    )
  return "\n".join(lines)
