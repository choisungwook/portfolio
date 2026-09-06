import boto3

from client.config import REGION


def management_client():
  """Use the management environment's AWS credentials for Roles Anywhere administration."""
  return boto3.Session().client("rolesanywhere", region_name=REGION)


def owned_crls(service, lab: dict) -> list[dict]:
  """Find only CRLs belonging to this exact lab trust anchor and CRL name."""
  return [
    crl
    for page in service.get_paginator("list_crls").paginate()
    for crl in page["crls"]
    if crl["trustAnchorArn"] == lab["trust_anchor_arn"] and crl["name"] == lab["crl_name"]
  ]
