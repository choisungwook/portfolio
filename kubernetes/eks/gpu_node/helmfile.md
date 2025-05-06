## 개요
* helmfile을 사용하여 helm chart 릴리즈합니다.

## 준비

1. helmfile을 설치합니다.

```sh
brew install helmfile
```

2. helmfile 플러그인을 다운로드 받습니다.

```sh
helmfile init
```

## helmfile apply

1. helm values를 수정합니다. helmfile.yaml에서 environment값을 수정합니다.

```sh
$ cat helmfile.yaml
environments:
  default:
    values:
    - global:
        clusterName: {EKS cluster 이름}
    - karpenter:
        interruptionQueue: {karpenter Interruption SQS Queue}
        irsa: {karpenter IRSA IAM role}

```

4. helmfile을 apply하여 helm chart를 릴리즈합니다.

```sh
helmfile apply
```

5. karpenter contrller pod 상태를 확인합니다.

```sh
$ kubectl -n karpenter get pod
NAME                         READY   STATUS    RESTARTS   AGE
karpenter-57c5bf9dbd-j9n2t   1/1     Running   0          2m59s
karpenter-57c5bf9dbd-jnn5x   1/1     Running   0          2m59s
```

## helmfile destroy
* 실습이 끝나면 helmfile로 배포한 helm release를 삭제합니다.

```sh
helmfile destroy
```
