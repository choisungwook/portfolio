from scripts.pki import PKI, create_ca, issue_client


def main() -> None:
  """Create the lab CA, an authorized v1 leaf and a leaf with a disallowed CN."""
  create_ca(PKI)
  issue_client(PKI, "v1", "memory-client")
  issue_client(PKI, "denied", "other-client")
  print(f"PKI_READY {PKI}")


if __name__ == "__main__":
  main()
