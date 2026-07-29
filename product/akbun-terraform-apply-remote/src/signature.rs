use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// Verifies a GitHub webhook signature header (X-Hub-Signature-256)
/// against the raw request body using the shared webhook secret.
///
/// The header format is "sha256=<hex digest>". Comparison is constant-time.
pub fn verify(secret: &str, body: &[u8], signature_header: &str) -> bool {
  let hex_digest = match signature_header.strip_prefix("sha256=") {
    Some(rest) => rest,
    None => return false,
  };
  let expected = match hex::decode(hex_digest) {
    Ok(bytes) => bytes,
    Err(_) => return false,
  };
  let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
    Ok(mac) => mac,
    Err(_) => return false,
  };
  mac.update(body);
  mac.verify_slice(&expected).is_ok()
}

#[cfg(test)]
mod tests {
  use super::*;

  fn sign(secret: &str, body: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(body);
    format!("sha256={}", hex::encode(mac.finalize().into_bytes()))
  }

  #[test]
  fn accepts_valid_signature() {
    let body = br#"{"action":"created"}"#;
    let header = sign("s3cret", body);
    assert!(verify("s3cret", body, &header));
  }

  #[test]
  fn rejects_wrong_secret() {
    let body = br#"{"action":"created"}"#;
    let header = sign("other-secret", body);
    assert!(!verify("s3cret", body, &header));
  }

  #[test]
  fn rejects_tampered_body() {
    let header = sign("s3cret", b"original body");
    assert!(!verify("s3cret", b"tampered body", &header));
  }

  #[test]
  fn rejects_missing_prefix() {
    let body = b"body";
    let header = sign("s3cret", body).replace("sha256=", "");
    assert!(!verify("s3cret", body, &header));
  }

  #[test]
  fn rejects_non_hex_digest() {
    assert!(!verify("s3cret", b"body", "sha256=not-hex-at-all"));
  }
}
