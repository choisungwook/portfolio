import argparse
import hashlib
import platform
import tempfile
import urllib.request
from pathlib import Path

VERSION = "1.8.5"
RELEASES = {
  ("Darwin", "arm64"): (
    "Aarch64/MacOS/Sonoma",
    "ac4b656cd83ffde5a6e9e8f2317ffb90e036c9bb704cc80faa6aee414b55915a",
  ),
  ("Darwin", "x86_64"): (
    "X86_64/MacOS/Sonoma",
    "aab355e1e7468056be88a56bbfb030ea33ff32bef2ce20f5dd6a0b1cae5aae5a",
  ),
  ("Linux", "aarch64"): (
    "Aarch64/Linux/Amzn2023",
    "3d131aa888cd56da446f9c6bb460b1f0569f6c7edc74eae6193a2fe3928883ba",
  ),
  ("Linux", "x86_64"): (
    "X86_64/Linux/Amzn2023",
    "beec9ed1c492d93db809890f16713e3556353294b823c2184ad4e891f1b2b54d",
  ),
}


def install(destination: Path) -> None:
  """Download the official platform binary, verify its published SHA256, then install."""
  release, expected = RELEASES[(platform.system(), platform.machine())]
  destination.parent.mkdir(parents=True, exist_ok=True)
  if destination.exists():
    if hashlib.sha256(destination.read_bytes()).hexdigest() != expected:
      raise ValueError("Existing helper differs; select a new destination or inspect it first")
    destination.chmod(0o755)
    return
  url = f"https://rolesanywhere.amazonaws.com/releases/{VERSION}/{release}/aws_signing_helper"
  with urllib.request.urlopen(url, timeout=60) as response:
    content = response.read()
  if hashlib.sha256(content).hexdigest() != expected:
    raise ValueError("Official helper SHA256 mismatch")
  with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as output:
    temporary = Path(output.name)
    output.write(content)
  temporary.chmod(0o755)
  temporary.replace(destination)


def main() -> None:
  """Install a pinned official helper for macOS or Linux."""
  parser = argparse.ArgumentParser()
  parser.add_argument("--destination", type=Path, default=Path("runtime/bin/aws_signing_helper"))
  args = parser.parse_args()
  install(args.destination)
  print(f"HELPER_READY version={VERSION} path={args.destination.resolve()}")


if __name__ == "__main__":
  main()
