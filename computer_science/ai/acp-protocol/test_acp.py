"""Self-check for the ACP demo. Run: uv run python test_acp.py"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "src"))

from client import DemoClient  # noqa: E402

ROOT = os.path.dirname(os.path.abspath(__file__))
OUTPUT = os.path.join(ROOT, "acp-out.txt")


def run(**kwargs) -> dict:
  client = DemoClient(cwd=ROOT, **kwargs)
  try:
    return client.run("summarize the readme")
  finally:
    client.close()


def test_allowed_turn_writes_the_file() -> None:
  if os.path.exists(OUTPUT):
    os.remove(OUTPUT)
  result = run()
  assert result["stopReason"] == "end_turn", result
  assert result["permissionAsked"], "the agent must ask before writing"
  assert "plan" in result["updates"]
  assert "tool_call" in result["updates"]
  assert os.path.exists(OUTPUT), "an allowed write must reach the disk"


def test_rejected_permission_stops_the_write() -> None:
  if os.path.exists(OUTPUT):
    os.remove(OUTPUT)
  result = run(allow_writes=False)
  assert result["stopReason"] == "end_turn", result
  assert not os.path.exists(OUTPUT), "a rejected write must not reach the disk"


def test_withheld_capability_disables_the_tool() -> None:
  result = run(fs_capability=False)
  assert result["stopReason"] == "end_turn", result
  assert "tool_call" not in result["updates"], "no fs capability means no file tool call"
  assert not result["permissionAsked"]


if __name__ == "__main__":
  for name, case in sorted(globals().items()):
    if name.startswith("test_"):
      case()
      print(f"ok  {name}")
  print("\nall checks passed")
