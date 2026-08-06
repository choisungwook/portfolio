# Skip-TLS-verify on the SDK's legacy hyper path

## Decision

The Settings toggle that skips TLS certificate verification (default off) is implemented with aws-smithy-http-client's hyper-014 feature: a hyper-rustls 0.24 connector over rustls 0.21 with a verifier that accepts every certificate, passed to each SDK client's http_client only when the toggle is on.

## Reason

The modern smithy connector's TlsContext accepts trust stores but has no way to disable verification, and its Connector internals are pub(crate), so a custom verifier cannot be injected there; the legacy HyperClientBuilder is the one supported entry point that takes an arbitrary connector. The cost is a second rustls/hyper generation in the dependency tree, accepted until the SDK grows first-class skip-verify support (aws-sdk-rust issue 1175 tracks it).
