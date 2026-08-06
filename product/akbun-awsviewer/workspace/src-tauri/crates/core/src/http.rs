//! The optional skip-TLS-verify HTTP client.
//!
//! Some corporate networks resign HTTPS with a proxy CA the OS does not
//! trust. The Settings toggle (off by default) routes AWS calls through this
//! client instead of the SDK default. The modern smithy connector only
//! accepts trust stores, so this is built on the SDK's legacy hyper 0.14
//! path, the one place that accepts an arbitrary connector.

use aws_smithy_http_client::hyper_014::HyperClientBuilder;
use aws_smithy_runtime_api::client::http::SharedHttpClient;
use std::sync::Arc;
use std::time::SystemTime;

/// Accepts every server certificate. Only reachable behind the Settings
/// toggle; nothing else may construct a client from this.
#[derive(Debug)]
struct AcceptAnyServerCert;

impl rustls::client::ServerCertVerifier for AcceptAnyServerCert {
    fn verify_server_cert(
        &self,
        _end_entity: &rustls::Certificate,
        _intermediates: &[rustls::Certificate],
        _server_name: &rustls::ServerName,
        _scts: &mut dyn Iterator<Item = &[u8]>,
        _ocsp_response: &[u8],
        _now: SystemTime,
    ) -> Result<rustls::client::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::ServerCertVerified::assertion())
    }
}

pub fn insecure_http_client() -> SharedHttpClient {
    let tls = rustls::ClientConfig::builder()
        .with_safe_defaults()
        .with_custom_certificate_verifier(Arc::new(AcceptAnyServerCert))
        .with_no_client_auth();
    let connector = hyper_rustls::HttpsConnectorBuilder::new()
        .with_tls_config(tls)
        .https_or_http()
        .enable_http1()
        .enable_http2()
        .build();
    HyperClientBuilder::new().build(connector)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustls::client::ServerCertVerifier;

    #[test]
    fn verifier_accepts_anything() {
        let verifier = AcceptAnyServerCert;
        let cert = rustls::Certificate(vec![0u8; 8]);
        let name = rustls::ServerName::try_from("example.com").unwrap();
        let result = verifier.verify_server_cert(
            &cert,
            &[],
            &name,
            &mut std::iter::empty(),
            &[],
            SystemTime::now(),
        );
        assert!(result.is_ok());
    }

    #[test]
    fn insecure_client_constructs() {
        let _client = insecure_http_client();
    }
}
