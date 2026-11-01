# ML Platform Engineering Part 2 핸즈온

도서 *Machine Learning Platform Engineering*(Manning, 2026) Part 2(4~6장)를 바탕으로, 최신 오픈소스(2026년 기준)를 활용해 k3s 단일 노드 환경에서 MLOps 전체 수명주기(ML Lifecycle)를 실습할 수 있도록 재구성한 핸즈온 가이드입니다. 

Kubeflow 배포판(Notebooks, Pipelines, KServe)과 MLflow(Tracking, Registry), Feast(Feature Store), GPU Time-Slicing을 연계하여 실무형 ML 플랫폼의 핵심 기능을 단계별로 구현합니다.

## 문서 목차

### 환경 준비
- [실습 환경 준비 및 전체 배포](./docs/setup.md)
- [Ubuntu GPU 인스턴스 재부팅 후 환경 복구 퀵스타트](./docs/quickstart_for_myubuntugpu.md)
- [트러블슈팅 가이드](./docs/troubleshooting.md)
- [Kubernetes 매니페스트 인덱스](./manifests/README.md)

### Lab 0. 플랫폼 엔지니어링 기반 구축
- [Lab 0. 문제 배경: 최신 오픈소스 환경 기반의 ML 플랫폼 재구성](./docs/1-lab0-problem.md)
- [Lab 0 시나리오 1. ML 수명주기 전 단계를 지원하는 MLOps 플랫폼 일괄 배포](./docs/2-lab0-platform-install.md)
- [Lab 0 시나리오 2. GPU 타임슬라이싱(Time-Slicing)을 통한 단일 GPU 자원 공유](./docs/3-lab0-gpu-time-slicing.md)
- [Lab 0 시나리오 3. 플랫폼 안정성을 위한 PR 단위 프리뷰(Preview) 환경 격리](./docs/4-lab0-pr-preview.md)
- [Lab 0 정리: 실습 리소스 회수](./docs/5-lab0-cleanup.md)

### Lab 1. MLOps 수명주기(ML Lifecycle) 실습
- [Lab 1 시나리오 1. ML 수명주기(Lifecycle)와 오픈소스 MLOps 플랫폼 로드맵](./docs/6-lab1-mlops-platform.md)
- [Lab 1 시나리오 2. 모델 레지스트리: 도커 이미지처럼 모델 등록 및 관리(Push & Pull)](./docs/7-lab1-model-registry.md)
- [Lab 1 시나리오 3. 표준화된 개발 환경: Kubeflow Notebooks와 플랫폼 연동](./docs/8-lab1-kubeflow-notebook.md)
- [Lab 1 시나리오 4. 탐색적 데이터 분석(EDA)과 Kubeflow Pipelines 기반 실행 자동화](./docs/9-lab1-eda.md)
- [Lab 1 시나리오 5. 실험 추적(Tracking)과 데이터 계보(Lineage) 관리](./docs/10-lab1-experiment-lineage.md)
- [Lab 1 시나리오 6. Champion 모델 승격과 모델 재현성(Reproducibility) 검증](./docs/11-lab1-registry-reproducibility.md)
- [Lab 1 시나리오 7. 모델 서빙: KServe를 통한 프로덕션 레벨 HTTP API 배포](./docs/12-lab1-model-serving.md)
- [Lab 1 시나리오 8. 피처 스토어(Feast): 학습-서빙 간 피처 일관성 보장 및 왜곡(Skew) 방지](./docs/13-lab1-feature-store.md)
