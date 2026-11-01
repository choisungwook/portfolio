# Lab 0 정리: 실습 리소스 회수

실습 중 생성된 임시 리소스 및 노트북 환경을 정리하여 클러스터 자원을 확보합니다.

## 1. 잔여 PR 프리뷰 환경 확인 및 정리

PR이 닫히거나 `preview` 라벨이 제거되면 Argo CD가 프리뷰 환경을 자동 삭제합니다. 혹시 남아 있는 프리뷰 애플리케이션이 없는지 확인합니다.

```bash
kubectl -n argocd get applications.argoproj.io | grep mlflow-preview
```

## 2. 수동 생성 노트북 및 스토리지 볼륨 삭제

Lab 1 실습을 위해 `kubectl`로 수동 배포했던 노트북 인스턴스와 데이터 볼륨(PVC)을 삭제합니다.

```bash
kubectl delete -f manifests/kubeflow-notebook/
```

> [!CAUTION]
> PVC를 삭제하면 노트북 내부(`/home/jovyan`)에 저장된 작업 파일과 수정 코드가 영구적으로 삭제됩니다. 보관이 필요한 파일은 사전에 로컬 또는 Git에 백업해 두세요.

## 3. 플랫폼 전체 삭제 (클러스터 초기화)

실습 환경 전체를 완전히 삭제하고 초기 상태로 되돌리려면 [setup.md](./setup.md)의 `## 리소스 회수 및 삭제 (Down)` 절차를 따릅니다.
