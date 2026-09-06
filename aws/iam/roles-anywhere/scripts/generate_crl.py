from scripts.pki import PKI, generate_crl

if __name__ == "__main__":
  print(f"CRL_READY {generate_crl(PKI)}; AWS upload is still required")
