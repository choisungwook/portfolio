#!/bin/sh
# Issue a lab CA and three leaf certificates used by the SNI routing lab.
# Idempotent: it exits early when the CA already exists.
set -eu

OUT=${OUT:-/certs}
DAYS=825

mkdir -p "$OUT/bundles"

if [ -f "$OUT/ca.crt" ]; then
  echo "certificates already exist in $OUT, skipping"
  exit 0
fi

openssl req -x509 -newkey rsa:2048 -sha256 -days "$DAYS" -nodes \
  -keyout "$OUT/ca.key" -out "$OUT/ca.crt" \
  -subj "/CN=haproxy-sni-lab-ca" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"

# issue <file name> <subjectAltName value>
issue() {
  name=$1
  san=$2

  openssl req -newkey rsa:2048 -nodes \
    -keyout "$OUT/$name.key" -out "$OUT/$name.csr" \
    -subj "/CN=$name" \
    -addext "subjectAltName=$san" \
    -addext "extendedKeyUsage=serverAuth"

  openssl x509 -req -in "$OUT/$name.csr" \
    -CA "$OUT/ca.crt" -CAkey "$OUT/ca.key" -CAcreateserial \
    -days "$DAYS" -sha256 -copy_extensions copyall \
    -out "$OUT/$name.crt"

  rm -f "$OUT/$name.csr"

  # HAProxy loads one PEM holding leaf, chain and key.
  cat "$OUT/$name.crt" "$OUT/ca.crt" "$OUT/$name.key" > "$OUT/bundles/$name.pem"
  chmod 644 "$OUT/$name.key" "$OUT/bundles/$name.pem"
}

issue a.lab.local "DNS:a.lab.local"
issue b.lab.local "DNS:b.lab.local"

# The fallback certificate carries an IP SAN so that https://127.0.0.1 verifies.
issue default "DNS:default.lab.local,IP:127.0.0.1"

echo "certificates written to $OUT"
