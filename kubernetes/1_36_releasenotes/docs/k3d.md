# k3d로 Kubernetes 1.36 cluster 만들기

## 환경

| 항목 | 값 |
|---|---|
| Kubernetes | v1.36.0 |
| k3s | v1.36.0+k3s1 |
| k3d | v5.8.3 이상 |
| kubectl | v1.36.x 권장 |
| cluster name | `k8s-136` |
| node image | `rancher/k3s:v1.36.0-k3s1` |

```sh
k3d version
```

기대 결과:

- `k3d version v5.8.3` 이상

기존 설치본을 교체하지 않고 검증하려면 임시 binary를 받아서 직접 실행한다.

```sh
curl -L -o /tmp/k3d-darwin-arm64 https://github.com/k3d-io/k3d/releases/download/v5.8.3/k3d-darwin-arm64
chmod +x /tmp/k3d-darwin-arm64
/tmp/k3d-darwin-arm64 version
```

## cluster 생성

k3s release tag는 `v1.36.0+k3s1`이지만, Docker image tag에서는 `+` 대신 `-`를 쓴다.

```sh
k3d cluster create k8s-136 \
  --image rancher/k3s:v1.36.0-k3s1
```

cluster 버전을 확인한다.

```sh
kubectl version
kubectl get nodes -o wide
```

kube-apiserver admission plugin 설정을 확인한다.

```sh
kubectl get --raw /flagz | rg "enable-admission-plugins"
```

기대 결과:

- `Server Version: v1.36.0+k3s1`
- `enable-admission-plugins: [NodeRestriction,MutatingAdmissionPolicy]`

검증 당시 node runtime은 `containerd://2.2.3-k3s1`로 표시되었다.

## 정리

k3d cluster를 삭제한다.

```sh
k3d cluster delete k8s-136
```

## 참고자료

- k3s v1.36.0+k3s1 release: <https://github.com/k3s-io/k3s/releases/tag/v1.36.0%2Bk3s1>
- k3d release: <https://github.com/k3d-io/k3d/releases>
- k3d 공식 문서: <https://k3d.io/>
- k3s advanced options: <https://docs.k3s.io/advanced>
