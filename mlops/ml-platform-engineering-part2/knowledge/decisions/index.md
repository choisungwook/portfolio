# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

* [GitOps 저장소를 새로 만들지 않고 이 저장소의 workspace를 Argo CD가 읽는다](2026-10-gitops-in-portfolio-repo.md) - 플래닝의 별도 저장소 대신 portfolio master와 manifests/argocd.
* [object storage NetworkPolicy는 지우지 않고 label 기반 허용 정책을 더한다](2026-10-seaweedfs-networkpolicy-label-allow.md) - 배포판은 namespace 단위로 막아서 정책 하나를 지워도 풀리지 않아서.
* [배포판 KServe를 Standard 모드로 바꾸고 Ingress 생성을 끈다](2026-10-kserve-standard-without-ingress.md) - Knative 없이 port-forward로 접근.
* [PR 미리보기 Application이 namespace 리소스를 직접 소유한다](2026-10-preview-owns-namespace.md) - CreateNamespace는 삭제 후 namespace를 남겨서.
* [Kubeflow로 할 수 있는 구성요소는 Kubeflow 배포판에서 가져온다](2026-10-kubeflow-distribution-components.md) - 책 목표가 MLflow와 Kubeflow 실습이라서.
* [GPU 한 장을 DRA 대신 NVIDIA device plugin time-slicing으로 나눈다](2026-10-gpu-time-slicing.md) - Notebook UI와 KServe가 nvidia.com/gpu limit을 써서.
* [Argo CD Application은 app-of-apps 없이 ApplicationSet으로만 만든다](2026-10-applicationset-only.md) - 구성요소 Application이 경로와 namespace만 달라서.
* [노트북은 Kubeflow Notebook으로 만들고 접속 정보는 PodDefault로 넣는다](2026-10-kubeflow-notebook-poddefault.md) - 노트북 코드에 주소와 계정을 두지 않으려고.
* [Redis는 PVC 없이, PostgreSQL 비밀번호는 Git에 실습 값으로 둔다](2026-10-lab-only-state-and-secrets.md) - 미리보기 namespace가 Secret 없이 뜨지 못하는 문제 회피.
* [Lab 1의 Kubeflow 예제는 KFP 파이프라인으로 만들고 모델 버전은 MLflow 레지스트리에 둔다](2026-10-kubeflow-examples-kfp-with-mlflow-registry.md) - 책 5장 흐름이고 레지스트리를 둘로 만들지 않으려고.
