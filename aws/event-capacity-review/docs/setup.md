# Setup

The lab runs two JVM processes on one machine. The `app` process is the Spring Boot API that
would run on EC2, the `db` process is the shared downstream that stands in for RDS. No Docker,
no AWS account.

Requirements: JDK 21 or later, Maven, `uv`, `curl`, `make`. On macOS install them with Homebrew.

## Up

The first run builds the jar, so it takes longer than the ones after it. Every knob has a default,
so `make up` alone is a valid start.

```bash
make up
```

Override any knob on the same command. These are the values the experiments change.

```bash
make up THREADS=200 POOL=10 POOL_TIMEOUT=3000 HIT=0.0 DB_WORKERS=4 DB_SERVICE_MS=20 DB_MAXCONN=60
```

## Down

This kills every process the lab started, including a second app instance if you started one.

```bash
make down
```
