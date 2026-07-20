---
type: Topic
title: JVM SecureRandom seeding
description: How the JDK selects its entropy source and why -Djava.security.egd=file:/dev/./urandom contains an extra dot.
tags: [java, jvm, security]
timestamp: 2026-07-20T00:00:00Z
---

## Insight

* SHA1PRNG (used by Tomcat session ID generation) reads its initial seed from `securerandom.source`, which defaults to `file:/dev/random`. The first `nextBytes` call triggers the read, so entropy starvation shows up as a startup hang, not a request-time hang.
* `-Djava.security.egd=<url>` overrides that source at JVM launch. It exists to redirect seeding to a non-blocking device.
* On JDK 7 and earlier, the exact string `file:/dev/urandom` was special-cased (JDK-4705093) and the JVM still ended up reading `/dev/random` (reported as JDK-6202721). The path `file:/dev/./urandom` points at the same device file but misses the string comparison, so the override actually takes effect. JDK 8 removed the special case, making the dot unnecessary.
* `new SecureRandom()` returns NativePRNG on Linux, whose `nextBytes` already reads `/dev/urandom`. The hang only appears on code paths that request SHA1PRNG explicitly or call `generateSeed`.

## Citations

1. https://bugs.openjdk.org/browse/JDK-6202721
2. https://access.redhat.com/solutions/2066163
3. https://www.baeldung.com/java-security-egd
