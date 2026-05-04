"""Recipe 8.1 의 step 1→2→3을 한 번에 실행하는 entrypoint.

Docker로 한 번에 돌리고 싶을 때 사용. 개별로 보고 싶으면 각 스크립트를 직접 실행.
"""
import runpy
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STEPS = ("1_test_models.py", "2_evaluate_responses.py", "3_analysis.py")


def main():
  for step in STEPS:
    print(f"\n========== {step} ==========")
    runpy.run_path(str(HERE / step), run_name="__main__")


if __name__ == "__main__":
  sys.exit(main() or 0)
