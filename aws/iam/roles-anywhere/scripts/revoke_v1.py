from scripts.pki import PKI, revoke_client

if __name__ == "__main__":
  path = revoke_client(PKI, PKI / "clients/v1/client.crt")
  print(f"CRL_READY {path}; AWS upload is still required")
