# 1. 개요
* linux cgroup으로 cpu 테스트

# 2. 실습 환경
* [vagrant VM](./Vagrantfile)
* [kind kubernetes cluster](./kind-config.yaml)

# 3. docker로 cpu share 테스트
* 테스틀 쉽게 하기 위해 0번 코어만 사용하고 core 1개만 사용하도록 제한

```sh
docker run -d --rm  --cpu-shares 1024 --cpus "1" --cpuset-cpus 0-0 busybox sh -c "timeout 60s sh -c 'while :; do :; done'"
docker run -d --rm  --cpu-shares 512 --cpus "1" --cpuset-cpus 0-0 busybox sh -c "timeout 60s sh -c 'while :; do :; done'"
```

# 4. 쿠버네티스로 cpu share 테스트

## 4.1 metrics sever 설치

```sh
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
helm upgrade --install -f ./manifests/metrics-server/values.yaml -n kube-system metrics-server metrics-server/metrics-server
kubectl -n kube-system get pod -l app.kubernetes.io/instance=metrics-server
```

## 4.2 cgroup-cpu-worker2 노드에 cpu 제한

```sh
docker update --cpus "1" --cpuset-cpus "0" cgroup-cpu-worker2

```


## 4.3 pod 실행

```sh
# pod 실행
kubectl apply -f ./request_cpu

# 모니터링
kubectl top pod
```
