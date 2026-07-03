import argparse
from urllib.request import Request, urlopen


def parse_args() -> argparse.Namespace:
  """Parse CLI arguments."""
  parser = argparse.ArgumentParser(description="Read a few SSE data events.")
  parser.add_argument("--url", default="http://localhost:8000/events")
  parser.add_argument("--events", type=int, default=3)
  return parser.parse_args()


def read_events(url: str, limit: int) -> None:
  """Print SSE data lines until limit events are received."""
  request = Request(url, headers={"Accept": "text/event-stream"})
  received = 0

  with urlopen(request, timeout=10) as response:
    for raw_line in response:
      line = raw_line.decode("utf-8").strip()

      if line.startswith("data: "):
        received += 1
        print(line.removeprefix("data: "))

      if received >= limit:
        break


def main() -> None:
  """Run the SSE CLI client."""
  args = parse_args()
  read_events(args.url, args.events)
