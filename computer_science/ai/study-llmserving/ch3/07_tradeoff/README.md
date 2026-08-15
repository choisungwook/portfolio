# 07. Cost-optimized vs Latency-optimized (주제 7)

## 코드 설명 (10초)

> 두 설계의 차이는 **라우터가 무엇을 알고 있느냐** 하나로 압축된다.
> `router.py`(cost-optimized)는 backend들의 `/models`를 2초마다 폴링해 "지금 어느 인스턴스에 어느 model이 떠 있는지"를 학습하고, warm한 곳으로 보낸다 — 없으면 아무 데나 보내고 그 인스턴스가 cold start를 문다. **관측 후 조정 = reactive.**
> `static_router.py`(latency-optimized)는 ConfigMap에서 읽은 고정 map만 본다. 폴링도 학습도 없다 — model마다 전용 Deployment가 **이미 떠서 model을 preload한 상태**이기 때문이다.
> 대가는 manifest에 그대로 드러난다: cost는 Deployment 1개 replica 2개, latency는 model마다 Deployment 1개씩. model이 100개면 Deployment 100개다.

---

## 클러스터 준비

## Mac — kind

```bash
kind create cluster --name ch03 --config 01_setup/kind-cluster.yaml
kubectl config use-context kind-ch03

docker build -t ch03-serving:local -f Dockerfile .
kind load docker-image ch03-serving:local --name ch03
```

## Ubuntu — k3s

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

docker build -t ch03-serving:local -f Dockerfile .
docker save ch03-serving:local | sudo k3s ctr images import -

# k3s 단일 노드에는 role=serving label이 없으므로 붙여줌
kubectl label node $(kubectl get node -o jsonpath='{.items[0].metadata.name}') role=serving --overwrite
```

> k3s에서는 NodePort 30080/30081이 호스트에 바로 열림.
> kind는 `kind-cluster.yaml`의 `extraPortMappings`로 이미 매핑되어 있음.

---

## A. Cost-optimized 배포

```bash
kubectl apply -f 07_tradeoff/manifests/cost-optimized.yaml
kubectl -n ch03-cost rollout status deploy/multimodel-serving
kubectl -n ch03-cost rollout status deploy/router

curl -s http://localhost:30080/routing_map | python3 -m json.tool
# 처음에는 map이 비어 있음 → 아직 아무 model도 로드 안 됨
```

트래픽을 흘린 뒤 다시 보기:

```bash
uv run python 07_tradeoff/bench_designs.py --cost-url http://localhost:30080 --latency-url "" --requests 20
curl -s http://localhost:30080/routing_map | python3 -m json.tool
# map이 채워짐. sticky_hits / fallbacks 비율을 볼 것
```

## B. Latency-optimized 배포

```bash
kubectl apply -f 07_tradeoff/manifests/latency-optimized.yaml
kubectl -n ch03-latency rollout status deploy/sentiment
kubectl -n ch03-latency rollout status deploy/spam

curl -s http://localhost:30081/routing_map | python3 -m json.tool
# 트래픽 없이도 map이 이미 채워져 있음 = 사전 provisioning
```

## C. 비교

```bash
uv run python 07_tradeoff/bench_designs.py \
  --cost-url http://localhost:30080 \
  --latency-url http://localhost:30081 \
  --pattern round-robin --requests 30
```

출력 예:

```
pattern=round-robin requests=30
    design   cold    p50(s)    p95(s)    max(s)   mean(s)
      cost      2     0.041     1.284     3.912     0.298
   latency      0     0.038     0.052     0.061     0.041
```

편향 트래픽으로도:

```bash
uv run python 07_tradeoff/bench_designs.py --pattern skewed --requests 40
```

## D. 비용 축 확인

```bash
kubectl -n ch03-cost get pods -o wide
kubectl -n ch03-latency get pods -o wide

# 요청한 리소스 총합 비교
kubectl -n ch03-cost describe nodes | grep -A5 "Allocated resources"
kubectl -n ch03-latency get deploy -o custom-columns=NAME:.metadata.name,REPLICAS:.spec.replicas
```

- cost: Pod 2개로 model 4개를 커버
- latency: model 2개에 Pod 2개. model이 늘면 **선형으로 늘어남**

## E. hot model 시나리오

특정 model에만 트래픽을 몰아보기:

```bash
# cost 쪽: replica를 늘려도 어느 Pod에 model이 뜰지 라우터가 사후에 알게 됨
kubectl -n ch03-cost scale deploy/multimodel-serving --replicas=4
uv run python 07_tradeoff/bench_designs.py --cost-url http://localhost:30080 --latency-url "" --pattern skewed --requests 40

# latency 쪽: 해당 model만 독립적으로 스케일
kubectl -n ch03-latency scale deploy/sentiment --replicas=3
uv run python 07_tradeoff/bench_designs.py --cost-url "" --latency-url http://localhost:30081 --pattern skewed --requests 40
```

## 관찰 포인트

노트북에서는 [07_tradeoff.ipynb](./07_tradeoff.ipynb)의 dynamic routing map과 static routing 코드를 직접 실행한다.

1. **cold start는 cost 쪽에서만 발생**. `p95`와 `max`에서 티가 남 (p50은 비슷함 — 평균만 보면 속는다)
2. cost 라우터의 map은 **트래픽이 흐른 뒤에야** 채워짐 = reactive
3. `--pattern skewed`에서 cost 쪽 cold start가 줄어듦 → 트래픽 국소성이 높으면 cost 설계가 유리
4. latency 쪽 scale은 `kubectl scale deploy/sentiment` 한 줄. cost 쪽은 replica를 늘려도 **어느 Pod가 그 model을 갖게 될지 통제 불가**
5. Pod 수 대 커버 model 수를 세어보면 비용 축이 그대로 보임

## 정리

```bash
kubectl delete -f 07_tradeoff/manifests/cost-optimized.yaml
kubectl delete -f 07_tradeoff/manifests/latency-optimized.yaml

kind delete cluster --name ch03        # Mac
# /usr/local/bin/k3s-uninstall.sh      # Ubuntu
```

## 스스로 답해보기

- q10: cost-optimized가 reactive라서 생기는 근본 한계는? latency-optimized는 대신 무엇을 포기하나?
- q13(퀴즈): cost에서 특정 model latency가 튄다. 원인 2개와 완화책 각각 1개
- EKS 경험과 대응: cost ≒ bin-packing + cluster-autoscaler / latency ≒ 워크로드별 노드그룹 + 최소 replica 고정. 실제로 같은 trade-off인가?
