---
type: Decision
title: Place the workspace under computer_science/jvm/
description: Move the hands-on from computer_science/jvm_urandom/ to computer_science/jvm/urandom/ to start a grouped JVM directory.
tags: [workflow, repository-structure]
timestamp: 2026-07-20T00:00:00Z
---

## Decision

Host this workspace at `computer_science/jvm/urandom/` — a new `jvm/` parent directory with one subdirectory per JVM topic — instead of the flat `computer_science/jvm_urandom/` used initially.

## Reason

- JVM hands-ons were accumulating as flat siblings (`jvm_warmup`, `jvm_class_loading`, `java/heapdump`); a `jvm/` parent gives future JVM topics one predictable home, mirroring how `ai/` groups its sub-topics.
- The directory name uses the repository's existing `computer_science` spelling (underscore) rather than introducing a hyphenated variant, so one convention stays in force.
- Existing sibling directories were left in place: renaming them would break published links in the root README history for no functional gain. Only new JVM topics adopt the grouped layout. This wiki and its ADRs also live inside the workspace so the knowledge travels with the hands-on.
