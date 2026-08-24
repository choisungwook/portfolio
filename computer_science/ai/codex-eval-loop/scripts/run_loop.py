from hashlib import sha256
from pathlib import Path
import shutil
import subprocess

from judge import ROOT, evaluate, failure_report


MAX_ROUNDS = 3
MUTABLE = ROOT / "candidate" / "path_policy.py"
IGNORED_DIRS = {".git", ".uv-cache", ".venv", "__pycache__"}


def protected_files() -> tuple[Path, ...]:
  return tuple(
    sorted(
      path
      for path in ROOT.rglob("*")
      if path.is_file()
      and path != MUTABLE
      and not IGNORED_DIRS.intersection(path.relative_to(ROOT).parts)
    )
  )


def snapshot() -> dict[Path, str]:
  return {
    path: sha256(path.read_bytes()).hexdigest()
    for path in protected_files()
  }


def changed_files(before: dict[Path, str]) -> tuple[Path, ...]:
  after = snapshot()
  paths = set(before) | set(after)
  return tuple(
    sorted(path for path in paths if before.get(path) != after.get(path))
  )


def run_codex(report: str) -> int:
  prompt = f"""Read task.md and fix the implementation.

You may modify only candidate/path_policy.py.
Do not inspect cases/holdout.json.
Do not modify the judge, cases, tests, task, or AGENTS.md.
Run the train gate before finishing.

Current deterministic judge evidence:
{report}
"""
  command = [
    "codex",
    "exec",
    "--ephemeral",
    "--sandbox",
    "workspace-write",
    "--cd",
    str(ROOT),
    prompt,
  ]
  return subprocess.run(command, check=False).returncode


def main() -> int:
  if shutil.which("codex") is None:
    print("codex CLI를 찾을 수 없어요.")
    return 2

  before = snapshot()
  train_path = ROOT / "cases" / "train.json"
  holdout_path = ROOT / "cases" / "holdout.json"

  for round_number in range(1, MAX_ROUNDS + 1):
    train = evaluate(train_path)
    print(f"\nROUND {round_number}\n{failure_report(train)}")
    if train.is_success:
      holdout = evaluate(holdout_path)
      print(f"HOLDOUT: {holdout.passed}/{holdout.total} passed")
      if holdout.is_success:
        print("GATE: SHIP")
        return 0
      print("GATE: STOP — holdout 세부 정보는 코치에게 전달하지 않아요.")
      return 1

    if run_codex(failure_report(train)) != 0:
      print("GATE: STOP — Codex 실행이 실패했어요.")
      return 2

    changed = changed_files(before)
    if changed:
      print("GATE: STOP — 보호 파일이 변경됐어요.")
      for path in changed:
        print(f"- {path.relative_to(ROOT)}")
      return 2

  print(f"GATE: STOP — {MAX_ROUNDS}회 예산을 모두 사용했어요.")
  return 1


if __name__ == "__main__":
  raise SystemExit(main())
