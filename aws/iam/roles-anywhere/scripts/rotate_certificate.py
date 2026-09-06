from scripts.pki import PKI, issue_client

if __name__ == "__main__":
  destination = issue_client(PKI, "v2", "memory-client")
  print(f"ROTATION_READY {destination}; switch both certificate and private-key paths")
