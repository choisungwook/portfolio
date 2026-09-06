import argparse
import time

from client.config import lab_config
from client.credentials import certificate_session, helper_command
from client.memory import memory_client, round_trip


def positive_number(value: str) -> float:
  """Reject zero and negative observation intervals or durations."""
  number = float(value)
  if not 0 < number < float("inf"):
    raise argparse.ArgumentTypeError("Use a positive finite number")
  return number


def observe(memory, memory_id: str, minutes: float, interval: float) -> None:
  """Reuse one SDK client during a bounded observation without caching frozen keys."""
  deadline = time.monotonic() + minutes * 60
  iteration = 0
  while time.monotonic() < deadline:
    round_trip(memory, memory_id)
    iteration += 1
    print(f"OBSERVATION_OK iteration={iteration}", flush=True)
    time.sleep(min(interval, max(0, deadline - time.monotonic())))


def main() -> None:
  """Exercise a running process across the default one-hour credential lifetime."""
  parser = argparse.ArgumentParser()
  parser.add_argument("--minutes", type=positive_number, default=75)
  parser.add_argument("--interval", type=positive_number, default=300)
  args = parser.parse_args()
  lab = lab_config()
  with certificate_session(helper_command(lab)) as session, memory_client(session) as memory:
    observe(memory, lab["memory_id"], args.minutes, args.interval)
  print("PASS observation completed; verify CreateSession renewal in CloudTrail", flush=True)


if __name__ == "__main__":
  main()
