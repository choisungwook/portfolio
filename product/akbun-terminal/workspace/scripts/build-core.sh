#!/bin/bash
# Builds the Rust core as a static library for the Swift package to link.
#
# swift build cannot do this itself, so it runs first. The link path in
# Package.swift is core/target/release, which is why the release profile is used
# even for a test run: one path keeps the package file free of build modes.
set -euo pipefail

cd "$(dirname "$0")/.."

cargo build --release --manifest-path core/Cargo.toml

echo "core/target/release/libakbun_terminal_ffi.a"
