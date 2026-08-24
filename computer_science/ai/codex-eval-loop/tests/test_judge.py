import sys
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from judge import Case, failure_report, score_cases
from run_loop import protected_files


class JudgeTest(unittest.TestCase):
  def test_scores_each_case(self) -> None:
    cases = (
      Case(name="allowed", path="src/app.py", expected=True),
      Case(name="blocked", path="../secret", expected=False),
    )

    result = score_cases(lambda path: not path.startswith(".."), cases)

    self.assertTrue(result.is_success)
    self.assertEqual(result.passed, 2)

  def test_reports_failure_evidence(self) -> None:
    cases = (Case(name="blocked", path="../secret", expected=False),)

    result = score_cases(lambda path: True, cases)

    self.assertFalse(result.is_success)
    self.assertIn("expected=False, actual=True", failure_report(result))

  def test_only_candidate_is_mutable(self) -> None:
    protected = protected_files()

    self.assertIn(ROOT / "task.md", protected)
    self.assertIn(ROOT / "candidate" / "path_policy_baseline.py", protected)
    self.assertNotIn(ROOT / "candidate" / "path_policy.py", protected)


if __name__ == "__main__":
  unittest.main()
