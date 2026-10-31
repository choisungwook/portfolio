# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-10-31

* **Update**: SeaweedFS NetworkPolicy 결정을 [label 기반 허용](decisions/2026-10-seaweedfs-networkpolicy-label-allow.md)으로 바꾸고 파일 이름 변경. 배포판의 기본 정책 때문에 정책 삭제로는 풀리지 않음.
* **Creation**: [Kubeflow 배포판 구성요소](decisions/2026-10-kubeflow-distribution-components.md), [GPU time-slicing](decisions/2026-10-gpu-time-slicing.md) 결정 기록. standalone KFP와 일반 JupyterLab을 대체.
* **Deletion**: KFP env/platform-agnostic 결정. 배포판의 multi-user overlay를 쓰면서 더 이상 맞지 않음.
* **Update**: JupyterLab 결정을 [Kubeflow Notebook과 PodDefault](decisions/2026-10-kubeflow-notebook-poddefault.md)로, [KServe 결정](decisions/2026-10-kserve-standard-without-ingress.md)을 배포판 KServe로 갱신.
* **Creation**: [ApplicationSet으로만 만든다](decisions/2026-10-applicationset-only.md), [클러스터 안 JupyterLab](decisions/2026-10-kubeflow-notebook-poddefault.md) 결정 기록.
* **Update**: [KFP의 seaweedfs NetworkPolicy를 kustomize patch로 지운다](decisions/2026-10-remove-seaweedfs-networkpolicy.md) label 기반 허용에서 정책 삭제로 바꿈.
* **Update**: PR 미리보기 generator를 토큰 없이 180초 폴링으로 바꿔 [저장소 결정](decisions/2026-10-gitops-in-portfolio-repo.md)과 [Secret 결정](decisions/2026-10-lab-only-state-and-secrets.md) 갱신.

## 2026-10-25

* **Creation**: Lab 0 코드 작성 중 플래닝과 달라진 결정 6개를 [decisions/](decisions/index.md)에 기록. 저장소 위치, KFP overlay, SeaweedFS 접근, KServe 구성, 미리보기 namespace 소유, 실습용 상태와 Secret.
