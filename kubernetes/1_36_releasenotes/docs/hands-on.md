# Kubernetes 1.36 k3d 핸즈온

## 전제

- [k3d.md](./k3d.md)로 Kubernetes v1.36.0 cluster를 만든다.
- `MutatingAdmissionPolicy` admission plugin이 켜져 있어야 한다.
- 실습 manifest는 [../manifests/README.md](../manifests/README.md)를 기준으로 본다.

## 핸즈온 1. MutatingAdmissionPolicy

MutatingAdmissionPolicy와 binding을 배포한다.

```sh
kubectl apply -f kubernetes/1_36_releasenotes/manifests/mutating-admission-policy.yaml
kubectl apply -f kubernetes/1_36_releasenotes/manifests/mutating-admission-policy-binding.yaml
```

policy informer가 반영할 시간을 잠깐 둔다.

```sh
sleep 2
```

sample pod를 생성한다.

```sh
kubectl apply -f kubernetes/1_36_releasenotes/manifests/sample-pod.yaml
```

admission 단계에서 label이 자동 추가되었는지 확인한다.

```sh
kubectl get pod map-sample-pod -o jsonpath='{.metadata.labels.release\.kubernetes\.io/tested-version}{"\n"}'
```

기대 결과:

- `v1.36`

정리한다.

```sh
kubectl delete -f kubernetes/1_36_releasenotes/manifests/sample-pod.yaml --interactive=false
kubectl delete -f kubernetes/1_36_releasenotes/manifests/mutating-admission-policy-binding.yaml --interactive=false
kubectl delete -f kubernetes/1_36_releasenotes/manifests/mutating-admission-policy.yaml --interactive=false
```

<!-- akbun-writing: webhook을 줄이고 싶었던 운영 경험이 있으면 여기 추가 -->

## 핸즈온 2. User Namespaces

`hostUsers: false`가 들어간 pod를 배포한다.

```sh
kubectl apply -f kubernetes/1_36_releasenotes/manifests/user-namespace-pod.yaml
```

pod가 Ready가 될 때까지 기다린다.

```sh
kubectl wait --for=condition=Ready pod/userns-root-pod --timeout=90s
```

pod 내부에서는 root로 보이는지 확인한다.

```sh
kubectl exec userns-root-pod -- id
```

k3d node 쪽 UID mapping은 node container 안에서 확인한다.

```sh
K3D_SERVER_NODE=$(docker ps \
  --filter "label=app=k3d" \
  --filter "label=k3d.cluster=k8s-136" \
  --filter "label=k3d.role=server" \
  --format '{{.Names}}' \
  | head -n 1)

docker exec "${K3D_SERVER_NODE}" ps -eo pid,user,args | grep "sleep 3600"
```

기대 결과:

- pod 내부 `id`는 `uid=0(root)`처럼 보인다.
- host 또는 node namespace에서는 같은 프로세스가 root가 아닌 UID range로 보인다.
- 검증 당시 node container에서는 `sleep 3600` 프로세스가 `66079948` 사용자로 보였다.

정리한다.

```sh
kubectl delete -f kubernetes/1_36_releasenotes/manifests/user-namespace-pod.yaml --interactive=false
```

## 핸즈온 3. `/statusz`와 `/flagz`

kube-apiserver의 status 정보를 확인한다.

```sh
kubectl get --raw /statusz
```

kube-apiserver의 실행 flag 정보를 확인한다.

```sh
kubectl get --raw /flagz
```

structured JSON으로 받고 싶으면 local proxy를 띄운 뒤 `Accept` header를 지정한다.

```sh
kubectl proxy --port=8001
```

다른 터미널에서 `/statusz` structured response를 요청한다.

```sh
curl -H 'Accept: application/json;v=v1beta1;g=config.k8s.io;as=Statusz' http://127.0.0.1:8001/statusz
```

다른 터미널에서 `/flagz` structured response를 요청한다.

```sh
curl -H 'Accept: application/json;v=v1beta1;g=config.k8s.io;as=Flagz' http://127.0.0.1:8001/flagz
```

운영 환경에서는 이 endpoint가 `system:monitoring` group 권한 모델과 맞물린다. cluster 외부로 무심코 노출하지 않는다.

## 핸즈온 4. cgroup v2와 PSI metrics 확인

k3d node container의 cgroup filesystem type을 확인한다.

```sh
K3D_SERVER_NODE=$(docker ps \
  --filter "label=app=k3d" \
  --filter "label=k3d.cluster=k8s-136" \
  --filter "label=k3d.role=server" \
  --format '{{.Names}}' \
  | head -n 1)

docker exec "${K3D_SERVER_NODE}" stat -fc %T /sys/fs/cgroup/
```

기대 결과:

- `cgroup2fs`

PSI kernel file을 확인한다.

```sh
docker exec "${K3D_SERVER_NODE}" sh -c 'cat /proc/pressure/cpu | head -n 1'
```

node 이름을 변수로 둔다.

```sh
NODE_NAME=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
```

kubelet Summary API에서 PSI 값을 확인한다.

```sh
kubectl get --raw "/api/v1/nodes/${NODE_NAME}/proxy/stats/summary" \
  | jq '.node.cpu.psi, .node.memory.psi, .node.io.psi'
```

Prometheus 형식 pressure metric을 확인한다.

```sh
kubectl get --raw "/api/v1/nodes/${NODE_NAME}/proxy/metrics/cadvisor" \
  | rg "container_pressure_(cpu|memory|io)_(waiting|stalled)_seconds_total" \
  | head
```

MemoryQoS 관련 kubelet 설정을 확인한다.

```sh
kubectl get --raw "/api/v1/nodes/${NODE_NAME}/proxy/configz" \
  | jq '.kubeletconfig | {memoryReservationPolicy, memoryThrottlingFactor, featureGates}'
```

## 핸즈온 5. `Service.spec.externalIPs` deprecation warning

`externalIPs`가 들어간 service를 생성한다.

```sh
kubectl apply -f kubernetes/1_36_releasenotes/manifests/deprecated-external-ip-service.yaml
```

기대 결과:

- kubectl 출력에 `externalIPs` deprecation warning이 표시된다.
- service는 아직 생성된다.

생성된 service를 확인한다.

```sh
kubectl get svc deprecated-external-ip-demo -o yaml
```

정리한다.

```sh
kubectl delete -f kubernetes/1_36_releasenotes/manifests/deprecated-external-ip-service.yaml --interactive=false
```

## 핸즈온 6. `gitRepo` volume plugin 비활성화

`gitRepo` volume을 쓰는 pod를 생성한다.

```sh
kubectl apply -f kubernetes/1_36_releasenotes/manifests/gitrepo-volume-pod.yaml
```

pod event를 확인한다.

```sh
kubectl describe pod gitrepo-volume-pod
```

기대 결과:

- apply 단계에서 `spec.volumes[0].gitRepo` deprecation warning이 표시된다.
- API object는 만들어질 수 있다.
- kubelet 단계에서 `no volume plugin matched` mount 실패 event가 발생한다.

정리한다.

```sh
kubectl delete -f kubernetes/1_36_releasenotes/manifests/gitrepo-volume-pod.yaml --interactive=false
```

## 참고자료

- Mutating Admission Policy 공식 문서: <https://kubernetes.io/docs/reference/access-authn-authz/mutating-admission-policy/>
- User Namespaces 공식 문서: <https://kubernetes.io/docs/concepts/workloads/pods/user-namespaces/>
- Kubernetes PSI metrics 공식 문서: <https://kubernetes.io/docs/reference/instrumentation/understand-psi-metrics/>
- Kubernetes cgroup v2 공식 문서: <https://kubernetes.io/docs/concepts/architecture/cgroups/>
