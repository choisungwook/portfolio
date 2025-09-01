# 개요

* kubeflow 설치 정리

## 전제조건

* 쿠버네티스가 설치되어 있어야 합니다. 저는 kind cluster를 사용했습니다.

## 권장사양

> 아래 권장사양은 공식사양이 아니고, 제가 생각하는 권장사양입니다.

* cpu: 4 core 이상
* memory: 32GB 이상
* storage size: 50GB 이상
* GPU: kubeflow 예제에서는 GPU가 필요 없지만, 프로덕션에는 GPU가 있으면 좋습니다.

## 설치방법

* 2025.8월 기준으로 kubeflow는 helm chart를 제공하지 않고 kustomize만 제공합니다. kubeflow는 layer단위로 리소스를 관리하고 싶어하기 때문에 kustomize를 채택한 것으로 추측합니다.

1. kubeflow manifests git repo를 clone합니다.

```sh
git clone https://github.com/kubeflow/manifests.git kubeflow_manifests
cd kubeflow_manifests
```

2. example 디렉터리에 있는 kustomize를 배포합니다. while로 계속 배포하는 이유는 kubeflow 예제가 엄청 많은 dependency(예: istio, cert-manager 등)가 있어 계속 설치를 시도해야 합니다. 약 10분이 지나면 설치가 모든 예제가 설치됩니다.

```sh
while ! kustomize kustomize ./example | kubectl apply --server-side --force-conflicts -f -; do echo "Retrying to apply resources"; sleep 20; done
```

## 프로덕션에 kubeflow를 어떻게 설치하면 좋을까?

* 프로덕션에 정말 kubeflow를 설치한다면, kubeflow 컴퍼넌트 하나하나씩 kustomize를 만들어 배포하는게 관리가 편할 것 같습니다.
* [예시](./components/)

## 다음에 할 작업

* [kubeflow dashboard에 접속](../dashboard/)
* [kind cluster에 유틸성 오픈소스 설치](../../../tools/kind-cluster/)

## 참고자료

* CNC의 kubeflow 설명: https://www.cncf.io/blog/2023/07/25/kubeflow-brings-mlops-to-the-cncf-incubator/
