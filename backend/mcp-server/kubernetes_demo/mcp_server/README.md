# MCP Server

Management Control Plane for Kubernetes - A tool for managing Kubernetes resources.

## Requirements

- Python 3.9+
- Poetry for dependency management
- Kind cluster for local development

## Environment Setup

1. Create a Kind cluster:
```bash
kind create cluster --name mcp-demo
```

2. Create environment files:

`.env.local`:
```
KUBERNETES_CONFIG_PATH=~/.kube/config
API_HOST=0.0.0.0
API_PORT=8000
LOG_LEVEL=DEBUG
```

`.env.dev`:
```
KUBERNETES_HOST=https://kubernetes.default.svc
KUBERNETES_TOKEN=/var/run/secrets/kubernetes.io/serviceaccount/token
KUBERNETES_CERT=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
API_HOST=0.0.0.0
API_PORT=8000
LOG_LEVEL=INFO
```

## Installation

```bash
poetry install
```

## Running the Server

Local development:
```bash
PROFILE=local poetry run python main.py
```

Development environment:
```bash
PROFILE=dev poetry run python main.py
```

## API Documentation

Once the server is running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
