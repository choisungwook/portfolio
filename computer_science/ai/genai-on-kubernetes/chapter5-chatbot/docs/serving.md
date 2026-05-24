# LLM 운영 서빙 개요

LLM 운영 서빙은 학습 코드와 분리해서 모델을 API로 제공하는 과정이다. 실습에서는 FastAPI가 직접 `model.generate()`를 호출하지만, 운영에서는 전용 model serving runtime을 두는 경우가 많다.

## 보편적인 구조

```text
client or chatbot UI
→ application API
→ model serving endpoint
→ GPU worker
→ model weights and adapter
```

application API는 인증, 요청 검증, 프롬프트 구성, 비즈니스 로직을 맡는다. model serving endpoint는 tokenizer, batching, GPU memory, KV cache, generation을 맡는다.

## 자주 쓰는 서빙 방식

- vLLM: LLM 서빙에서 자주 쓰인다. OpenAI-compatible API, continuous batching, KV cache 관리가 강점이다.
- Hugging Face TGI: Hugging Face 모델을 API로 서빙할 때 많이 쓴다. 컨테이너 기반 배포와 streaming 응답을 지원한다.
- NVIDIA Triton: 조직에서 NVIDIA inference stack을 표준으로 쓸 때 선택한다. LLM뿐 아니라 다양한 모델을 함께 운영할 수 있다.
- 직접 FastAPI: 작은 실습이나 내부 도구에 적합하다. 이해하기 쉽지만 batching, 동시성, warmup, observability를 직접 구현해야 한다.

## LoRA adapter 서빙

LoRA fine-tuning 결과는 보통 전체 모델이 아니라 adapter weight다. 추론할 때는 base model과 adapter를 함께 로드한다.

```text
base model + LoRA adapter = fine-tuned behavior
```

운영에서는 두 가지 방식이 흔하다.

- adapter를 runtime에서 base model에 붙여 서빙한다.
- adapter를 base model에 merge한 뒤 하나의 모델 artifact로 서빙한다.

adapter 방식은 파일이 작고 여러 adapter를 관리하기 쉽다. merge 방식은 배포 단위가 단순하지만 artifact가 커지고 adapter 교체가 무거워진다.

## 이 실습의 위치

현재 K3s inference API는 FastAPI가 pod 안에서 Qwen base model을 로드하고, `model-assets-pvc`의 LoRA adapter를 붙여 `/generate` API로 응답한다. Codex나 OpenAI API처럼 외부 모델 API를 호출하는 구조가 아니라, Kubernetes pod가 직접 GPU model server 역할을 한다.
