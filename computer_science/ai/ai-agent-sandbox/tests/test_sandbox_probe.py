import unittest

from scripts.sandbox_probe import ProbeResult, format_result, run_probe


class SandboxProbeTest(unittest.TestCase):
  def test_run_probe_returns_allowed_when_action_succeeds(self) -> None:
    result = run_probe("sample", "allowed", lambda: "ok")

    self.assertEqual(result.outcome, "allowed")
    self.assertEqual(result.detail, "ok")

  def test_run_probe_returns_blocked_when_action_fails(self) -> None:
    def fail() -> str:
      raise PermissionError("denied")

    result = run_probe("sample", "blocked", fail)

    self.assertEqual(result.outcome, "blocked")
    self.assertIn("PermissionError", result.detail)

  def test_format_result_contains_expected_and_observed(self) -> None:
    result = ProbeResult("sample", "blocked", "allowed", "ok")

    formatted = format_result(result)

    self.assertIn("expected=blocked", formatted)
    self.assertIn("observed=allowed", formatted)


if __name__ == "__main__":
  unittest.main()
