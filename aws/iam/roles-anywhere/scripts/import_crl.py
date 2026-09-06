from client.config import lab_config
from scripts.crl import management_client, owned_crls
from scripts.pki import PKI


def main() -> None:
  """Import the generated PEM CRL with management credentials, refusing duplicate imports."""
  lab = lab_config()
  service = management_client()
  if owned_crls(service, lab):
    raise RuntimeError("This lab CRL already exists; run python -m scripts.update_crl")
  result = service.import_crl(
    name=lab["crl_name"],
    trustAnchorArn=lab["trust_anchor_arn"],
    crlData=(PKI / "ca/revoked.pem").read_bytes(),
    enabled=True,
    tags=[{"key": "Project", "value": lab["project_name"]}],
  )
  print(f"CRL_IMPORTED id={result['crl']['crlId']}")


if __name__ == "__main__":
  main()
