# EKS 핸즈온 (Envoy)

TL;DR: 로컬 kind 검증 뒤에만 EKS를 만든다. EKS에서는 원격 registry의 앱 이미지를 쓰고, 앱은 `kubectl apply -f ../manifests/tcp-echo/` 한 번으로 올린다. Envoy는 Helm chart에 EKS values override를 적용해 NLB 뒤에 둔다. 모든 리소스는 default namespace를 사용한다.

## 리소스 배포

예제 변수 파일을 복사한다.

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

계획을 확인한다.

```bash
terraform init
terraform plan -var-file=terraform.tfvars
```

비용 발생을 승인한 뒤에만 apply한다.

```bash
terraform apply -var-file=terraform.tfvars
```

출력값의 kubeconfig 명령을 실행한다.

```bash
terraform output -raw update_kubeconfig_command
```

server/client 이미지를 원격 registry에 push한다.

```bash
make -C ../app push
```

server Service, headless Service, graceful server Deployment, interval client Deployment를 한 번에 배포한다.

```bash
kubectl apply -f ../manifests/tcp-echo/
kubectl rollout status deploy/tcp-echo-server
kubectl get pods,svc
kubectl get endpoints tcp-echo-server-headless
```

client Pod는 Envoy Service가 열릴 때까지 initContainer에서 기다린다.

Envoy를 Helm chart로 설치한다.

```bash
helm upgrade --install tcp-echo-envoy ../manifests/envoy \
  -f ../manifests/envoy/values.yaml \
  -f ../manifests/envoy/values-eks.yaml
kubectl rollout status deploy/tcp-echo-envoy
```

확인 필요: Envoy를 server보다 먼저 배포하면 STRICT_DNS가 endpoint를 찾지 못해 초기 health check가 실패할 수 있다. server Service가 생긴 뒤 endpoint가 채워지는지 확인한다.

NLB 주소를 확인한다.

```bash
kubectl get svc tcp-echo-envoy
```

## 시나리오 1 - server Deployment 재시작

Kubernetes 안의 client Pod 로그를 한 터미널에서 계속 본다.

```bash
kubectl logs deploy/tcp-echo-client-interval -f
```

로컬 client 프로세스로도 같은 시나리오를 관찰한다. 이 명령은 `terraform/` 디렉터리에서 실행하는 기준이며, NLB를 통해 Envoy에 접속한다.

```bash
NLB_HOST=$(kubectl get svc tcp-echo-envoy -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
HOST="$NLB_HOST" PORT=2000 MODE=interval AUTO_RECONNECT=false uv run --project ../app python ../app/tcp-client/client.py
```

다른 터미널에서 server Deployment를 rolling restart한다.

```bash
kubectl rollout restart deploy/tcp-echo-server
kubectl rollout status deploy/tcp-echo-server
```

`connection-error`가 발생하면 handoff 실패이며, Envoy TCP(L4) mode가 기존 stream 이전 요구사항을 만족하지 못한 결과로 기록한다.

## 시나리오 2 - server Pod 단일 교체

```bash
NLB_HOST=$(kubectl get svc tcp-echo-envoy -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
HOST="$NLB_HOST" PORT=2000 MODE=interval AUTO_RECONNECT=false uv run --project ../app python ../app/tcp-client/client.py
```

```bash
SERVER_POD=$(kubectl get pod -l app.kubernetes.io/component=server -o jsonpath='{.items[0].metadata.name}')
kubectl delete pod "$SERVER_POD"
```

`AUTO_RECONNECT=false`에서 `ConnectionError("server closed connection")`이 발생하면 이 시나리오는 실패다. 기존 TCP stream이 다른 backend Pod로 이어지지 않았다는 증거로 기록한다.

## 핵심 관찰

핵심 판단은 client 로그가 기준이다.

```bash
kubectl logs deploy/tcp-echo-client-interval -f
```

| 항목 | 의미 |
|---|---|
| `connection-error` 없음 | 통과. 같은 client TCP 연결이 유지됨 |
| `server closed connection` | 실패. backend 연결 종료가 client까지 전달됨 |
| `hostname=...` 변화 | 새 연결 또는 새 backend 선택이 관찰됨 |

Envoy admin은 NLB로 노출하지 않고 ClusterIP Service로 둔다.

```bash
kubectl port-forward svc/tcp-echo-envoy-admin 9901:9901
curl -s http://127.0.0.1:9901/clusters | grep tcp_echo_cluster
```

NLB 주소로 외부 client를 직접 붙여 확인한다.

```bash
NLB_HOST=$(kubectl get svc tcp-echo-envoy -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
HOST="$NLB_HOST" PORT=2000 MODE=manual uv run --project ../app python ../app/tcp-client/client.py
```

## NLB idle timeout 측정

NLB TCP idle timeout은 listener attribute `tcp.idle_timeout.seconds`로 조정한다. 기본값은 350초이고 60~6000초로 조정할 수 있다. `../manifests/envoy/values-eks.yaml`에 listener attribute annotation을 추가해 60초와 350초를 비교한다.

```yaml
service.beta.kubernetes.io/aws-load-balancer-listener-attributes.TCP-2000: tcp.idle_timeout.seconds=60
```

확인 필요: 이 annotation은 클러스터의 LoadBalancer 구현체(AWS Load Balancer Controller 등)에 따라 지원 여부가 달라질 수 있다. 지원하지 않으면 AWS 콘솔/CLI로 listener attribute를 확인하고 문서에 실제 결과를 기록한다.

## 리소스 정리

Terraform destroy 전에 Kubernetes 리소스를 먼저 내려 NLB와 관련 리소스가 정리되게 한다.

```bash
helm uninstall tcp-echo-envoy --ignore-not-found
kubectl delete -f ../manifests/tcp-echo/ --ignore-not-found
```

## 비용 종료

검증이 끝나면 즉시 EKS 리소스를 내린다.

```bash
terraform destroy -var-file=terraform.tfvars
```

확인 필요: 실제 AWS 계정의 quota, default VPC/subnet 존재 여부, EKS module의 Kubernetes minor version 지원 여부는 apply 전 `terraform plan`에서 확정한다.
