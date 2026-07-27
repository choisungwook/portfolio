# Setup

The local lab needs Docker only. The Spring Boot app is built inside the compose build, so no local Java is required.

## Up

Build and start MySQL, Valkey, and the app in one command from the workspace root.

```bash
docker compose up -d --build
```

The app listens on `http://localhost:8080`. Readiness check:

```bash
curl -s http://localhost:8080/actuator/health
```

## Down

Stop everything and drop the volumes.

```bash
docker compose down -v
```
