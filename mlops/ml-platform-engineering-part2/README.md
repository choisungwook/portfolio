# ML Platform Engineering Part 2 핸즈온

책 "Machine Learning Platform Engineering"(Manning, 2026) Part 2(4~6장)를 2026년 10월 기준 오픈소스로 바꿔 k3s에서 실습합니다. Kubeflow가 제공하는 구성요소는 Kubeflow 배포판에서 가져오고, MLflow와 GPU device plugin은 Helm chart로 설치합니다.

- [실습 환경 준비](./docs/setup.md)
- [Lab 0. 책의 플랫폼 설치 경로는 2026년에 그대로 동작하지 않습니다](./docs/1-lab0-problem.md)
- [Lab 0 시나리오 1. 모델 수명주기의 단계마다 맡을 컴포넌트를 한 번에 세웁니다](./docs/2-lab0-platform-install.md)
- [Lab 0 시나리오 2. GPU 한 장을 노트북과 서빙이 나눠 씁니다](./docs/3-lab0-gpu-time-slicing.md)
- [Lab 0 시나리오 3. 공유 플랫폼을 바꾸기 전에 PR마다 미리보기 환경에서 확인합니다](./docs/4-lab0-pr-preview.md)
- [Lab 0 정리](./docs/5-lab0-cleanup.md)
- [Lab 1 시나리오 1. 노트북 환경도 플랫폼이 제공합니다](./docs/6-lab1-kubeflow-notebook.md)
- [Lab 1 시나리오 2. 모델을 만들기 전에 데이터를 들여다보고 그 결과를 남깁니다](./docs/7-lab1-eda.md)
- [Lab 1 시나리오 3. 모델 3개를 같은 조건으로 비교하고 학습 데이터까지 연결합니다](./docs/8-lab1-experiment-lineage.md)
- [Lab 1 시나리오 4. 가장 좋은 모델을 등록하고, 기록만으로 같은 모델을 다시 만듭니다](./docs/9-lab1-registry-reproducibility.md)
- [트러블슈팅](./docs/troubleshooting.md)
- [매니페스트 인덱스](./manifests/README.md)
