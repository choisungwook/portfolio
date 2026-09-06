"""Publish the lab CRL to Roles Anywhere with the management profile (AWS_PROFILE=admin).

  python crl_aws.py import   # first upload of runtime/pki/ca/revoked.pem to the lab trust anchor
  python crl_aws.py update   # replace the CRL body after another revoke
  python crl_aws.py delete   # remove the lab CRL (run before terraform destroy)

AWS never fetches a CDP/OCSP URL by itself; this upload IS the revocation channel.
"""

import argparse
import json
import sys
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError

ROOT = Path(__file__).resolve().parent
REGION = "ap-northeast-2"


def load_lab() -> dict:
  return json.loads((ROOT / "runtime/lab.json").read_text())


def owned_crls(service, lab: dict) -> list[dict]:
  """Only CRLs on this lab's trust anchor with this lab's name; never touch other experiments."""
  return [
    crl
    for page in service.get_paginator("list_crls").paginate()
    for crl in page["crls"]
    if crl["trustAnchorArn"] == lab["trust_anchor_arn"] and crl["name"] == lab["crl_name"]
  ]


def main(argv: list[str] | None = None) -> None:
  parser = argparse.ArgumentParser(
    description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
  )
  parser.add_argument("command", choices=["import", "update", "delete"])
  args = parser.parse_args(argv)
  lab = load_lab()
  service = boto3.Session(region_name=REGION).client("rolesanywhere")
  existing = owned_crls(service, lab)
  crl_pem = ROOT / "runtime/pki/ca/revoked.pem"
  if args.command == "import":
    if existing:
      raise RuntimeError("Lab CRL already exists; use: python crl_aws.py update")
    result = service.import_crl(
      name=lab["crl_name"],
      trustAnchorArn=lab["trust_anchor_arn"],
      crlData=crl_pem.read_bytes(),
      enabled=True,
    )
    print(f"CRL_IMPORTED id={result['crl']['crlId']} enabled=True")
  elif args.command == "update":
    if len(existing) != 1:
      raise RuntimeError("Expected exactly one lab CRL; use: python crl_aws.py import")
    service.update_crl(crlId=existing[0]["crlId"], crlData=crl_pem.read_bytes())
    print(f"CRL_UPDATED id={existing[0]['crlId']}")
  else:
    for crl in existing:
      service.delete_crl(crlId=crl["crlId"])
      print(f"CRL_DELETED id={crl['crlId']}")
    if not existing:
      print("CRL_NONE nothing to delete")


if __name__ == "__main__":
  try:
    main()
  except (BotoCoreError, ClientError, FileNotFoundError, RuntimeError) as error:
    print(f"FAIL {type(error).__name__}: {error}", file=sys.stderr)
    sys.exit(1)
