from urllib.request import urlopen


def print_stream(url: str) -> None:
  """Print SSE frames from a streaming HTTP response."""
  with urlopen(url, timeout=60) as response:
    frame_lines: list[str] = []
    for raw_line in response:
      line = raw_line.decode("utf-8").rstrip("\n")
      if line:
        frame_lines.append(line)
        continue

      if frame_lines:
        print("\n".join(frame_lines), flush=True)
        print(flush=True)
        frame_lines = []


def main() -> None:
  """Read the local SSE endpoint."""
  print_stream("http://localhost:8000/events")
