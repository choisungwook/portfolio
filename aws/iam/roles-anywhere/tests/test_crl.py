import boto3
from botocore.stub import Stubber

from scripts.crl import owned_crls

ANCHOR = (
  "arn:aws:rolesanywhere:ap-northeast-2:123456789012:"
  "trust-anchor/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
)


def test_crl_selection_checks_both_trust_anchor_and_lab_name_across_pages():
  client = boto3.client(
    "rolesanywhere",
    region_name="ap-northeast-2",
    aws_access_key_id="AKIAEXAMPLE",
    aws_secret_access_key="fake-secret",
  )
  owned = {
    "crlId": "11111111-1111-1111-1111-111111111111",
    "name": "ra-lab-crl",
    "trustAnchorArn": ANCHOR,
  }
  unrelated = {**owned, "name": "another-lab-crl"}
  other_anchor = {**owned, "trustAnchorArn": ANCHOR.replace("aaaaaaaa", "bbbbbbbb")}
  with Stubber(client) as stubber:
    stubber.add_response("list_crls", {"crls": [unrelated, other_anchor], "nextToken": "page2"}, {})
    stubber.add_response("list_crls", {"crls": [owned]}, {"nextToken": "page2"})
    assert owned_crls(client, {"trust_anchor_arn": ANCHOR, "crl_name": "ra-lab-crl"}) == [owned]
    stubber.assert_no_pending_responses()
