from client.config import lab_config
from scripts.crl import management_client, owned_crls
from scripts.pki import PKI


def main() -> None:
  """Publish a newly generated full CRL to the one existing lab CRL resource."""
  lab = lab_config()
  service = management_client()
  matches = owned_crls(service, lab)
  if len(matches) != 1:
    raise RuntimeError("Expected exactly one lab CRL; check Roles Anywhere CRL resources")
  service.update_crl(crlId=matches[0]["crlId"], crlData=(PKI / "ca/revoked.pem").read_bytes())
  print(f"CRL_UPDATED id={matches[0]['crlId']}")


if __name__ == "__main__":
  main()
