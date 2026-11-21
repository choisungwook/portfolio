# Connection settings and CA bundle

Manages custom root CA certificates for environments with TLS-inspecting proxies, ported from `akbun-taskq`.

- `ca-bundle.ts`: validates PEM bundles with `node:crypto` `X509Certificate`, stores only certificate blocks in `$AIMEMORY_HOME/aimemory-ca-bundle.pem`, sets `NODE_EXTRA_CA_CERTS` and `AWS_CA_BUNDLE`, and updates the running process default CA list (`tls.setDefaultCACertificates`).
- HTTP API (`src/server.ts`): `GET /api/ca-bundle`, `PUT /api/ca-bundle` (`{ pem }`), `DELETE /api/ca-bundle`.
- Web & desktop UI (`ui/index.html`, `ui/app.js`): `#connections-dialog` provides PEM file import, certificate list (subject, issuer, expiry, SHA-256 fingerprint), and clear.
- Certificate pinning enforcement is out of scope; `config.connection.pinnedFingerprints` reserves the config slot.
