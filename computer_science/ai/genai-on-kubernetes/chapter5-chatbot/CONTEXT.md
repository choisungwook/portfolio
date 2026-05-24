# Chapter 5 Chatbot

Chapter 5 chatbot 학습 흐름에서 K3s 실행, EKS 실행, 공통 개념 설명의 경계를 맞추기 위한 용어집이다.

## Language

**핸즈온 문서**:
독자가 같은 순서로 명령을 실행해 결과를 확인할 수 있는 실습 중심 문서. 환경별로 하나씩 둘 수 있으며, 설명보다 재현 가능한 흐름을 우선한다.
_Avoid_: hand-on, 단순 README, 전체 요약

**대표 핸즈온 문서**:
한 실행 환경의 전체 실습 순서를 처음부터 끝까지 안내하는 입구 문서. 세부 설명을 모두 품기보다 상세 문서로 연결한다.
_Avoid_: 통합 문서, 모든 설명을 담은 문서

**EKS 상세 문서**:
EKS 전체 실습의 특정 단계나 주제를 자세히 설명하는 문서. 대표 핸즈온 문서에서 링크되는 참고 문서이며, K3s 전체 실습의 문서가 아니다.
_Avoid_: 공통 문서, 로컬 문서

**K3s 전체 실습**:
Ubuntu 24.04 LTS와 NVIDIA GPU가 있는 로컬 머신의 K3s single-node에서 Chapter 5의 Kubernetes 흐름 전체를 재현하는 실습. EKS 전체 실습과 목적은 같고, 차이는 cloud provider가 제공하는 compute, network, identity 같은 인프라 조건이다.
_Avoid_: kind 전체 실습, 로컬 검증 실습, 축약판 EKS, 일부 기능 확인

**single-node K3s server**:
한 Ubuntu host에서 K3s server가 control-plane과 workload node 역할을 함께 수행하는 실습용 cluster. K3s server는 kubelet, container runtime, CNI도 실행하므로 별도 worker node 없이 notebook, Job, inference Pod를 배치할 수 있다.
_Avoid_: worker node 필수, control-plane 전용 node

**Mac MLX fine-tuning**:
Mac M 시리즈에서 MLX-LM으로 LoRA adapter를 학습하는 fine-tuning 흐름. Chapter 4의 로컬 실험 방식으로 참고할 수 있지만, K3s 전체 실습의 기준 환경은 아니다.
_Avoid_: K3s 기준 환경, GPU Job 대체물

**NVIDIA GPU K3s 환경**:
NVIDIA GPU가 있는 Ubuntu 로컬 머신에서 K3s containerd가 GPU runtime을 사용하고, NVIDIA device plugin이 Pod에 `nvidia.com/gpu` 리소스를 노출하는 환경.
_Avoid_: Mac GPU, CPU-only K3s, nvkind

**GPU 부트스트랩 가이드**:
NVIDIA GPU를 K3s에서 처음 사용하는 독자가 host driver, NVIDIA Container Toolkit, K3s runtime, Kubernetes device plugin을 순서대로 검증하는 안내 문서. GPU Operator보다 NVIDIA device plugin을 먼저 다루어 실패 지점을 작게 나눈다.
_Avoid_: 경험자용 설치 메모, GPU Operator부터 시작하는 흐름

**경량 학습 모델**:
Chapter 5의 fine-tuning 흐름을 재현하기 위해 선택하는 작은 모델. 이 실습에서는 `Qwen/Qwen2.5-0.5B-Instruct`를 사용하며, 좋은 답변 품질이 아니라 notebook 실험, 학습 Job, inference 배포의 연결을 확인하는 것이 목적이다.
_Avoid_: production model, 성능 비교용 모델, 반드시 Llama 3 8B, TinyLlama

**Chapter 5 데이터셋**:
책 Chapter 5의 MyElite Loyalty Program fine-tuning 데이터와 MyRetail catalog RAG 데이터를 가리킨다. 모델을 경량 학습 모델로 바꾸더라도 데이터셋과 도메인, `prompt`/`response` JSON 구조는 Chapter 5를 따른다.
_Avoid_: Chapter 4 데이터셋, messages 전용 JSONL, 임의 도메인

**K3s 파일시스템 아티팩트**:
K3s 전체 실습에서 AWS 인증과 S3를 쓰지 않고 파일시스템과 PVC로 다루는 데이터셋과 fine-tuning 산출물. 입력 데이터셋은 host 파일시스템의 `/opt/genai-ch5/data`에서 읽고, 학습 결과 모델 아티팩트는 PVC에 저장한다.
_Avoid_: K3s S3 필수, aws login Job

**모델 아티팩트**:
fine-tuning Job이 만든 adapter, tokenizer, 설정 파일 같은 inference 입력 산출물. K3s 전체 실습에서는 PVC에 저장하고, inference API가 같은 PVC에서 읽는다.
_Avoid_: 학습 데이터셋, container image

**실행 가능한 핸즈온**:
문서만 맞추는 것이 아니라 K3s manifests, fine-tuning 코드, inference 코드가 문서 흐름과 함께 실행되도록 정리한 실습. README 링크와 실제 Kubernetes 리소스가 같은 범위를 가리켜야 한다.
_Avoid_: 문서 전용 계획, 실행 불가능한 가이드

**환경별 구현 분리**:
K3s 전체 실습과 EKS 전체 실습에서 인프라 차이 때문에 코드나 manifest가 달라지는 경우 억지로 공유하지 않고 환경별로 분리하는 원칙. 공통 개념은 문서에서 공유하고, 실행 구현은 각 환경에 맞춘다.
_Avoid_: 무리한 공통화, storage flag로 모든 환경 처리

**K3s 전용 앱 코드**:
K3s 전체 실습에서 쓰는 fine-tuning과 inference container 코드. `k3s/` 아래에 두어 K3s manifests와 함께 관리하고, EKS용 `terraform/` 코드와 분리한다.
_Avoid_: terraform 앱 코드 재사용 강제, 루트 공통 앱 디렉터리

**EKS S3 아티팩트**:
EKS 전체 실습에서 AWS S3로 다루는 데이터셋과 fine-tuning 산출물. Pod Identity 같은 EKS용 identity 흐름과 함께 사용한다.
_Avoid_: EKS 로컬 파일시스템 아티팩트

**실험 노트북**:
모델 학습이나 RAG 흐름을 배포 전에 대화식으로 확인하는 notebook 실습. Chapter 5에서는 JupyterHub에서 실험한 뒤 같은 흐름을 container와 Kubernetes Job으로 옮긴다는 관계가 중요하다.
_Avoid_: 부가 자료, 선택 실습

**학습 Job**:
실험 노트북에서 확인한 fine-tuning 흐름을 Kubernetes Job으로 실행하는 실습 단계. notebook을 대체하는 것이 아니라, 대화식 실험을 재현 가능한 batch 학습으로 옮긴 결과다.
_Avoid_: mock job, adapter 준비 Job, 생략 가능한 Job

**EKS 전체 실습**:
클라우드 환경에서 Chapter 5의 전체 흐름을 실행하는 실습. K3s 전체 실습과 같은 Kubernetes 흐름을 다루되 AWS EKS, cloud identity, managed storage, managed load balancer 같은 클라우드 인프라 조건을 포함한다.
_Avoid_: Terraform 실습, 운영 배포

**공통 원리**:
K3s 전체 실습과 EKS 전체 실습을 이해하는 데 모두 필요한 개념 설명. 특정 실행 환경의 명령 순서가 아니라 왜 그런 구조가 필요한지를 다룬다.
_Avoid_: 공통 실행 절차, 중복 README

## Example Dialogue

Dev: K3s 전체 실습에서도 모든 chatbot 경로를 확인해야 하나요?

Domain Expert: 네. K3s와 EKS는 인프라 조건이 다를 뿐 Kubernetes 흐름은 같아야 합니다.

Dev: K3s single-node에서 control-plane과 workload를 같이 실행해도 되나요?

Domain Expert: 네. 실습 환경에서는 single-node K3s server가 control-plane과 workload node 역할을 함께 수행합니다.

Dev: K3s 전체 실습의 fine-tuning은 Mac MLX로 실행하나요?

Domain Expert: 아니요. K3s 전체 실습은 Ubuntu NVIDIA GPU 환경에서 Kubernetes GPU Job으로 실행합니다.

Dev: 그럼 K3s 전체 실습에서는 notebook만 있으면 되나요?

Domain Expert: 아니요. JupyterHub에서 실험 노트북을 다루고, 그 흐름을 Kubernetes 학습 Job으로 옮기는 단계도 필요합니다.

Dev: K3s 학습 Job은 adapter를 복사하거나 검증만 해도 되나요?

Domain Expert: 아니요. 책의 흐름을 따라 fine-tuning 자체를 Job에서 실행해야 합니다.

Dev: 학습 모델은 반드시 Llama 3 8B QLoRA여야 하나요?

Domain Expert: 아니요. 목적은 좋은 모델을 만드는 것이 아니라 Chapter 5의 실습 흐름을 따라가는 것이므로 `Qwen/Qwen2.5-0.5B-Instruct`를 사용합니다.

Dev: 모델을 바꾸면 데이터셋도 Chapter 4 데이터셋으로 바꾸나요?

Domain Expert: 아니요. 데이터셋과 도메인은 Chapter 5를 따르고, 모델만 경량 학습 모델로 바꿉니다.

Dev: Qwen chat model을 쓰니까 데이터셋 구조도 `messages`로 바꾸나요?

Domain Expert: 아니요. Chapter 5의 `prompt`/`response` JSON 구조를 유지하고, K3s 코드에서 Qwen chat template으로 변환합니다.

Dev: Chapter 5 데이터셋은 S3에서만 읽나요?

Domain Expert: 아니요. K3s 전체 실습은 파일시스템과 PVC를 사용하고, EKS 전체 실습은 AWS S3를 사용합니다.

Dev: K3s에서 `aws login`을 Job 안에 넣어 S3를 쓰나요?

Domain Expert: 아니요. `aws login`은 브라우저 또는 인증코드 입력이 필요한 대화형 흐름이므로 K3s 전체 실습에서는 AWS 인증을 끊고 파일시스템/PVC를 사용합니다.

Dev: K3s에서 학습 결과 모델은 어디에 저장하나요?

Domain Expert: fine-tuning Job이 만든 모델 아티팩트는 PVC에 저장하고, inference API가 같은 PVC에서 읽습니다.

Dev: 이번 작업은 문서만 바꾸나요?

Domain Expert: 아니요. 실행 가능한 핸즈온이 되도록 K3s manifests와 fine-tuning/inference 코드도 함께 맞춥니다.

Dev: K3s와 EKS 구현이 다르면 하나의 코드에 flag로 합치나요?

Domain Expert: 아니요. 인프라 차이 때문에 달라지는 부분은 환경별 구현으로 분리합니다.

Dev: K3s 전용 fine-tuning과 inference 코드는 어디에 두나요?

Domain Expert: `k3s/` 아래에 두고, K3s manifests가 그 이미지를 사용하게 합니다.

Dev: K3s GPU 구성은 처음부터 GPU Operator로 시작하나요?

Domain Expert: 아니요. GPU 경험이 없는 사람도 따라올 수 있게 NVIDIA Container Toolkit과 NVIDIA device plugin을 먼저 사용하고, GPU Operator는 선택 확장 단계로 둡니다.

Dev: 그럼 클라우드 의존 기능은 어디에서 다루나요?

Domain Expert: EKS 전체 실습에서만 다루는 것이 아니라, K3s 전체 실습에서는 로컬 인프라 조건에 맞게 재현합니다. 두 실습이 같이 쓰는 배경 설명은 공통 원리로 분리합니다.

Dev: 기존 `00~05` 문서는 대표 핸즈온 문서로 합치나요?

Domain Expert: 아니요. `00~05`는 EKS 상세 문서로 유지하고, 대표 핸즈온 문서에서 필요한 순서대로 연결합니다.
