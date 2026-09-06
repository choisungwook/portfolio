import json
import subprocess
import sys

REGION = "ap-northeast-2"
SERVICES = [f"com.amazonaws.{REGION}.{name}" for name in ("sts", "bedrock-agentcore")]


def main() -> None:
  """Read regional endpoint-service availability without creating AWS resources."""
  command = [
    "aws",
    "ec2",
    "describe-vpc-endpoint-services",
    "--region",
    REGION,
    "--service-names",
    *SERVICES,
    "--query",
    "ServiceDetails[].{Name:ServiceName,AZs:AvailabilityZones}",
    "--output",
    "json",
  ]
  result = subprocess.run(command, check=True, capture_output=True, text=True)
  details = json.loads(result.stdout)
  if {entry["Name"] for entry in details} != set(SERVICES):
    raise RuntimeError("Both regional PrivateLink services must be available")
  print(json.dumps(details, indent=2))


if __name__ == "__main__":
  try:
    main()
  except subprocess.CalledProcessError as error:
    print(error.stderr.strip(), file=sys.stderr)
    sys.exit(error.returncode)
