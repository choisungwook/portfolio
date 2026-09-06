from client.config import ROOT, lab_config
from scripts.crl import management_client, owned_crls


def main() -> None:
  """Delete only this lab's imported CRL before Terraform removes its trust anchor."""
  if not (ROOT / "runtime/lab.json").exists():
    return
  lab = lab_config()
  service = management_client()
  for crl in owned_crls(service, lab):
    service.delete_crl(crlId=crl["crlId"])
    print(f"CRL_DELETED id={crl['crlId']}")


if __name__ == "__main__":
  main()
