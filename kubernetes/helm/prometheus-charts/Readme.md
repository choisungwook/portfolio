# 개요
* 프로메테우스 helm chart(+ 그파라나)
* helm chart는 https://github.com/bitnami/charts/tree/master/bitnami/kube-prometheus/ 에서 가져왔습니다.

# 설정
## ingress 도메인 설정
* config.yaml 설정

# 실행
```sh
helm install -n prometheus prometheus --dependency-update --create-namespace -f ./values.yaml ./charts/
```

# 삭제
```
helm delete -n prometheus prometheus 
```

# 주의사항
* grafana는 ingress path가 "/" 고정
* path변경하려면 configmap grafana.ini 수정 필요(참고자료 : https://stackoverflow.com/questions/57170106/trying-to-rewrite-url-for-grafana-with-ingress)


# exporter 목록
```sh
kubectl get ServiceMonitor -n prometheus
```
