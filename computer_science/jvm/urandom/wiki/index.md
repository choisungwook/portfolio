# Wiki: JVM /dev/./urandom Hands-on

Knowledge captured from this workspace, written in the Open Knowledge Format (OKF) 0.1 style used by the repository [knowledge bundle](../../../../knowledge/index.md). Pages record domain insight that the hands-on documents do not repeat; ADRs record why this workspace is built the way it is.

## Topics

* [JVM SecureRandom seeding](jvm-securerandom-seeding.md) - how the JDK picks its seed source and why the extra dot in /dev/./urandom exists.
* [Linux /dev/random history](linux-dev-random-history.md) - blocking pool removal in kernel 5.6 and what each distro kernel ships.
* [Reproduction environments](reproduction-environments.md) - why macOS and Docker cannot reproduce the blocking and what can.

## ADR

* [ADR index](adr/index.md) - decisions made while building this workspace.
