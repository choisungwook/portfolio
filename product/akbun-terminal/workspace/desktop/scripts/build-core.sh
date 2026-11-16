#!/bin/bash
# Builds the Rust daemon (and the tui, once it exists) for the app to bundle.
#
# The Cargo workspace is one directory above this package, so the binaries land
# in workspace/target/release. The tests locate the daemon there too, which is
# why the release profile is used even for a test run.
set -euo pipefail

cd "$(dirname "$0")/../.."

if [ -f tui/Cargo.toml ]; then
  cargo build --release --workspace
else
  cargo build --release
fi

echo "target/release/akbun-terminal-core"
