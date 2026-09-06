"""Print S01 /etc/hosts lines for one AZ from runtime/config.json. Never edits the OS."""

import argparse
import json
from ipaddress import IPv4Address
from pathlib import Path

REGION = "ap-northeast-2"


def main() -> None:
  parser = argparse.ArgumentParser()
  parser.add_argument("config", type=Path)
  parser.add_argument("--az")
  args = parser.parse_args()
  config = json.loads(args.config.read_text())
  if config["region"] != REGION:
    raise SystemExit(f"The lab region must be {REGION}")
  zones = sorted(config["services"]["sts"]["eips"])
  az = args.az or zones[0]
  if az not in zones:
    raise SystemExit(f"Choose a deployed AZ: {', '.join(zones)}")
  for service, hostname in (("sts", "sts"), ("memory", "bedrock-agentcore")):
    ip = IPv4Address(config["services"][service]["eips"][az])
    print(ip, f"{hostname}.{REGION}.amazonaws.com")


if __name__ == "__main__":
  main()
