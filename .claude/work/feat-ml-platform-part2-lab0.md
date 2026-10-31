# ML Platform Engineering Part 2 Lab 0 코드 작성

- Issue: 없음 (PR 생성 시 작성)
- Branch: feat/ml-platform-part2-lab0

## 실행 계획

- [x] 1. Lab 0 확인 필요 항목(SeaweedFS Service, k3s traefik 플래그, KServe 설치 절차) 공식 문서로 확인
- [x] 2. workspace와 knowledge 생성
- [x] 3. manifests(cert-manager, kfp, kserve, mlflow, redis, argocd) 작성과 kustomize 렌더링 확인
- [x] 4. docs(setup, Lab 0), AGENTS.md, knowledge decisions 작성
- [x] 5. Ubuntu에 k3s v1.36.5+k3s1 설치(--disable=traefik), 맥북 kubeconfig 연결
- [-] 5-1. github-token Secret 생성 — 건너뜀: public 저장소라 토큰 없이 폴링 180초로 변경
- [x] 5-2. seaweedfs NetworkPolicy를 kustomize patch로 삭제, docs를 repo-handson 양식(setup, 1-problem, 2-handson, 3-cleanup)으로 재작성
- [x] 5-3. Argo CD v3.5.6 설치
- [x] 6. Argo CD 적용, Application 6개 Synced/Healthy 확인 (MLflow OOM은 workers=1과 job execution 끄기로, kserve OutOfSync는 backendRef group patch로 해결)
- [x] 7. PR 미리보기 생성과 삭제 확인 (PR #1359에 preview label 부착 후 1분 48초에 생성, label 제거 후 2분 15초에 Application과 namespace 삭제)
- [x] 8. 실습 결과로 docs의 "실습 미진행"과 "확인 필요" 갱신, troubleshooting.md 작성
- [x] 8-1. root Application을 ApplicationSet으로 전환(운영 중 무중단), lifecycle 아키텍처 그림 교체
- [x] 8-2. Lab 1: 클러스터 안 JupyterLab, 노트북 3개(EDA, 실험·리니지, 레지스트리·재현성) 실행 검증, 시나리오 문서 4개
- [x] 8-3. Kubeflow 배포판(kustomize), MLflow와 GPU device plugin(Helm)으로 재설치. k3s --default-runtime=nvidia, time-slicing 4. 노트북 3개를 Kubeflow Notebook에서 검증
- [x] 8-4. docs 재작성(입문자 기준, 시나리오 3분, 부록), troubleshooting 11~18, NetworkPolicy 결정 갱신
- [ ] 8-5. Helm 기반 MLflow로 PR 미리보기 클러스터 재검증(렌더링만 확인)
- [x] 8-6. Lab 1 Kubeflow 예제: notebooks/pipelines(EDA, 학습 3개, 등록·검증) KFP 파이프라인
  - [x] PodDefault access-ml-pipeline, 노트북 label, kfp-kubernetes 추가. 노트북에서 kfp.Client 호출 확인
  - [x] 파이프라인 3개 로컬 컴파일 확인
  - [x] SeaweedFS mlpipeline 버킷 정책 복구 후 3개 실행 검증. 점수와 EDA 숫자가 MLflow 예제와 같음, register는 v2 등록·champion v1 유지
  - [x] 7, 8, 9번 문서에 MLflow 예제와 Kubeflow 예제 H2 분리, 6번 Configurations에 access-ml-pipeline 추가, troubleshooting 19
- [ ] 9. merge 전: targetRevision을 master로 되돌리고 이 상태 파일 삭제

## 다음 세션이 알아야 할 것

- mlpipeline 버킷에 bucket policy가 없음. profile controller가 namespace access key를 07:19에 만들 때 create-buckets Job(07:26)보다 먼저라 정책 설정이 실패했고 다시 시도하지 않음. user namespace의 Secret mlpipeline-minio-artifact를 지우면 새 key와 정책을 다시 만듦(2026-10-31에 실행해 복구함, troubleshooting 19)
- access-ml-pipeline PodDefault와 노트북 label은 kubectl로만 적용함. push 후 Argo CD가 user-resources를 sync해야 Git과 맞음

- platform-applicationset.yaml의 targetRevision과 kubeflow-applicationset.yaml의 wrapper 3개 revision, 6-lab1-kubeflow-notebook.md의 --branch 안내는 검증용으로 feat/ml-platform-part2-lab0. merge 전에 master로 되돌린다.
- Istio보다 먼저 뜬 kubeflow 파드는 kubectl -n kubeflow delete pod --all로 다시 만든다(troubleshooting 11). RollingSync로 자동화하는 것은 아직 안 함.
- 플래닝 문서는 고치지 않는다. 달라진 결정은 knowledge/decisions에 남긴다.
