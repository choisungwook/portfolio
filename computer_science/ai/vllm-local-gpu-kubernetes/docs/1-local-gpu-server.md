# 로컬 GPU 서버에서 vLLM을 먼저 띄우는 이유

## TL;DR

vLLM은 Kubernetes에 올리기 전에 Docker 단일 컨테이너로 먼저 검증하는 편이 좋습니다. 실패 원인이 모델 다운로드, GPU 드라이버, NVIDIA Container Toolkit, vLLM 옵션, Kubernetes 런타임 중 어디에 있는지 분리하기 쉽기 때문입니다.

## 왜 Kubernetes보다 Docker를 먼저 봐야 할까

vLLM을 처음 실행하면 모델을 내려받고 GPU 메모리에 로드하고 OpenAI 호환 API 서버를 연다. 이 과정에서 실패할 수 있는 지점이 많습니다. 바로 Kubernetes로 시작하면 Pod 스케줄링 문제인지, GPU가 컨테이너 안에 노출되지 않은 문제인지, 모델이 너무 커서 메모리가 부족한 문제인지 구분하기 어렵습니다.

그래서 첫 단계는 Docker입니다. Docker에서 `nvidia-smi`와 vLLM API 호출이 통과하면, 적어도 호스트 드라이버와 컨테이너 GPU 노출은 확인한 상태가 됩니다. **Kubernetes 실습은 그 다음에 같은 조건을 Pod 스펙으로 옮기는 과정입니다.**

## 로컬 서버는 어떤 조건을 만족해야 할까

먼저 호스트에서 GPU가 보여야 합니다.

GPU 드라이버 상태를 확인합니다.

```bash
nvidia-smi
```

이 명령이 실패하면 vLLM 문제가 아닙니다. NVIDIA driver 설치부터 확인해야 합니다. NVIDIA Container Toolkit 문서도 먼저 Linux 배포판에 맞는 GPU driver 설치를 전제로 둡니다.

다음으로 Docker 컨테이너에서 GPU가 보여야 합니다.

NVIDIA CUDA 컨테이너에서 GPU 접근을 확인합니다.

```bash
docker run --rm --gpus all nvidia/cuda:12.5.0-base-ubuntu22.04 nvidia-smi
```

이 명령이 실패하면 Docker가 NVIDIA runtime을 사용하지 못하는 상태입니다. 이때는 NVIDIA Container Toolkit을 설치하고 Docker runtime을 구성합니다.

Docker runtime을 NVIDIA Container Toolkit으로 구성합니다.

```bash
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

장점은 Docker에서 바로 GPU 노출을 확인할 수 있다는 점입니다. 단점은 이 단계만으로 Kubernetes의 device plugin이나 RuntimeClass 문제까지 검증되지는 않는다는 점입니다.

## 어떤 모델로 시작해야 할까

처음 실습 모델은 `Qwen/Qwen3-0.6B`로 둡니다. vLLM Docker 문서의 예시와 같고, 7B급 모델보다 로컬 GPU 메모리 부담이 작습니다.

그런데 작은 모델이면 충분할까요? 목적이 성능 벤치마크라면 부족합니다. 하지만 이 핸즈온의 목적은 vLLM 서버 실행, GPU 런타임 연결, OpenAI 호환 API 호출 검증입니다. 그래서 작은 공개 모델로 시작하는 편이 실패 원인을 줄입니다.

로컬 GPU 메모리 요구사항은 GPU 종류, dtype, context length, vLLM 버전에 따라 달라집니다. 정확한 최소 VRAM은 확인 필요입니다. 이 문서에서는 첫 실행 안정성을 위해 `--max-model-len 2048`로 시작합니다.

## Docker Compose로 어떻게 실행할까

이 디렉터리의 `docker-compose.yml`은 공식 `vllm/vllm-openai:latest` 이미지를 사용합니다. 공식 Docker 문서처럼 Hugging Face cache를 마운트하고, GPU를 컨테이너에 노출하고, 서버 포트 `8000`을 엽니다.

vLLM 서버를 백그라운드로 실행합니다.

```bash
make up
```

모델 다운로드와 서버 시작 로그를 확인합니다.

```bash
make logs
```

서버 health endpoint를 확인합니다.

```bash
make health
```

OpenAI 호환 chat completions API를 호출합니다.

```bash
make chat
```

정리합니다.

```bash
make down
```

## 토큰은 어디에 넣어야 할까

공개 모델이면 Hugging Face token 없이도 동작할 수 있습니다. 하지만 rate limit이나 gated model 때문에 토큰이 필요할 수 있습니다.

이때 토큰을 문서, compose 파일, manifest에 직접 적지 않습니다. 현재 셸에서만 환경변수로 넣습니다.

Hugging Face token을 현재 셸에만 설정합니다.

```bash
export HF_TOKEN="replace-with-your-token"
make up
```

장점은 저장소에 민감정보가 남지 않는다는 점입니다. 단점은 터미널 세션이 바뀌면 다시 설정해야 한다는 점입니다. `.env` 파일을 쓸 수도 있지만, 그 파일은 커밋하면 안 됩니다.

## 참고자료

- [vLLM Docker deployment](https://docs.vllm.ai/en/latest/deployment/docker/)
- [NVIDIA Container Toolkit install guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
