# macOS 환경 준비

## 대상

- Apple Silicon Mac
- CPU 또는 PyTorch MPS 사용
- Kubernetes 실습은 kind 사용
- vLLM library mode와 Triton server 실습 제외

## 도구 설치

Homebrew 패키지를 설치한다.

```bash
brew install uv colima docker docker-compose kind kubectl
```

Colima를 시작한다.

```bash
colima start --cpu 6 --memory 12 --disk 60 --arch aarch64
docker version
docker compose version
```

## Python 환경

shell에 다른 가상환경이 활성화되어 있으면 먼저 해제한다.

```bash
deactivate
```

프로젝트 루트에서 Python 3.13과 `.venv`를 생성한다.

```bash
uv python install 3.13
uv venv --python 3.13
source .venv/bin/activate
uv sync --dev
python --version
python -c "import torch, transformers, fastapi; print('deps ok')"
```

`VIRTUAL_ENV does not match the project environment path .venv` 경고는 다른 가상환경이 활성화된 상태라는 의미다. `--active`를 사용하지 않고 기존 환경을 해제한 뒤 프로젝트 `.venv`를 활성화한다.

## VS Code Notebook 환경

[VS Code Notebook 설정](./vscode_notebook.md)을 따른다.

## kind 클러스터

클러스터를 생성한다.

```bash
make create_kind
kubectl cluster-info --context kind-ch03
kubectl get nodes -L role
```

로컬 이미지를 로드한다.

```bash
docker build -t ch03-serving:local .
kind load docker-image ch03-serving:local --name ch03
```

클러스터를 삭제한다.

```bash
make delete_kind
```

## macOS 제약

| 항목 | 경로 |
| --- | --- |
| CUDA | CPU 또는 MPS 사용 |
| vLLM | Ubuntu RTX 서버 사용 |
| Triton server | Ubuntu RTX 서버 사용 |
