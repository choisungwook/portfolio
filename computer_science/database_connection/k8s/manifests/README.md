## 개요

* database connection 사용여부에 따른 성능 테스트를 위한 kubernetes manifests

## 예제 목차

> mysql은 configmap이 필요합니다.

* [mysql](./mysql.yaml)
* [database connection pool사용(springboot hikariCP)](./hikaricp.yaml)
* [database connection pool사용(springboot hikariCP)](./hikaricp-notuse.yaml)

## mysql을 위한 configmap

```sh

```



1. helmfile을 설치합니다.

```sh
brew install helmfile
```

2. helmfile 플러그인을 다운로드 받습니다.

```sh
helmfile init
```

3. ALB controller helm values를 수정합니다. helmfile.yaml에서 environment값을 수정합니다.

```sh
$ cat helmfile.yaml
environments:
  default:
    values:
    - clusterName: {EKS 이름}
      region: {aws region}
      vpcId: {VPC id}
      irsa: {ALB controller IRSA role}
```

4. helmfile을 apply합니다.

```sh
helmfile apply
```

## 1. prometheus kube-stack helm chart

helm repo add prometheus-community https://prometheus-community.github.io/helm-charts

helm upgrade --install \
  prometheus-community/kube-prometheus-stack \
  --version 69.8.1 \
  -f kube-stack-values.yaml
  prometheus-operator

## 2. metrics server

helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server
helm upgrade --install \
  metrics-server/metrics-server \
  --version 3.12.2 \
  -f metrics-server-values.yaml \
  metrics-server


export K6_INFLUXDB_BUCKET=default
export K6_INFLUXDB_ORGANIZATION=influxdata
export K6_INFLUXDB_TOKEN='password!@#$'
export K6_INFLUXDB_ADDR=http://localhost:30084


k6 run k6_test.js -o xk6-influxdb=http://localhost:30084

K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=html-report.html k6 run k6_test.js


```sh
xk6 build --with github.com/grafana/xk6-output-influxdb
```
