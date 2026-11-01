# Lab 0 정리

PR 미리보기 환경은 PR을 닫거나 `preview` label을 떼면 Argo CD가 지웁니다. 남은 미리보기 Application이 없는지 확인합니다.

```bash
kubectl -n argocd get applications.argoproj.io | grep mlflow-preview
```

Lab 1에서 kubectl로 만든 노트북은 Argo CD가 관리하지 않습니다. 노트북과 PVC를 지웁니다. PVC를 지우면 노트북에서 만든 파일도 사라집니다.

```bash
kubectl delete -f manifests/kubeflow-notebook/
```

플랫폼 전체를 지우려면 [setup.md](./setup.md)의 down을 실행합니다.
