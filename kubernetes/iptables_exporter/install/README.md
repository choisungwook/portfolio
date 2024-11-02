# 개요
* 쿠버네티스에서 iptables를 실습하기 위한 환경 설치

# kind cluster 생성

```sh
kind create cluster --config kind-config.yaml
```

# metrics server 설치

```sh
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
helm upgrade --install metrics-server \
  -n kube-system \
  -f ./metrics_server_values.yaml \
  metrics-server/metrics-server
```

# prometheus-operator stack 설치

```sh
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

```sh
helm upgrade --install prometheus-stack \
  -n monitoring --create-namespace \
  -f prometheus_stack_values.yaml \
  prometheus-community/kube-prometheus-stack
```

# prometheus, grafana 접속방법

* prometeus: http://localhost:30090
* grafana: http://localhost:30080

# kind cluster 삭제

```sh
kind delete cluster --name iptables-exporter
```
