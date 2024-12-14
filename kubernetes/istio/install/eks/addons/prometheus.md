# 개요
* istio mesh메트릭 수집을 담당하는 프로메테우스 설치

# 선수지식
* helm chart로 istio를 설치하면 프로메테우스 exporter설정이 디폴트로 활성화 되어 있다.

```sh
--set meshConfig.enablePrometheusMerge=true
```

# 설치방법
* helm values
  * 스토리지를 사용하지 않고 인메모리를 사용
  * retenetion 설정: 1d와 200MB
  * alertmanager 설치하지 않음

```sh
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm upgrade --install \
  -n istio-system --create-namespace \
  --version '25.30.1' \
  --set server.retention="1d" \
  --set server.retentionSize="200MB" \
  --set server.persistentVolume.enabled=false \
  --set alertmanager.enabled=false \
  prometheus prometheus-community/prometheus
```

# 참고자료
* https://istio.io/latest/docs/ops/integrations/prometheus/
