- [개요](#개요)
- [helm 다운로드](#helm-다운로드)
- [dependency 설치](#dependency-설치)
- [설정](#설정)
  - [ingress 도메인 설정](#ingress-도메인-설정)
  - [persistentvolume](#persistentvolume)
- [실행](#실행)
- [삭제](#삭제)
- [주의사항](#주의사항)
- [exporter 목록](#exporter-목록)
- [TroubleShooting](#troubleshooting)
- [참고자료](#참고자료)

# 개요
* 프로메테우스 helm chart(+ 그파라나)

<br>

# helm 다운로드
```
git clone https://github.com/prometheus-community/helm-charts
```

<br>

# dependency 설치
```sh
helm dependency update [차트경로: 예) ./kube-prometheus-stack]
```

<br>

# 설정
## ingress 도메인 설정
* config.yaml 설정

## persistentvolume
* 디렉터리 생성 후 권한 설정
  * 테스트 목적으로만: chmod -R 777 [생성한 디렉터리]
* pv 생성
```sh
kubectl apply -f pv.yaml
```
* values.yaml에 pv설정

<br>

# 실행
```sh
helm install prometheus -n logging --create-namespace  -f ./values.yaml  [차트경로: 예) ./kube-prometheus-stack]
```

<br>

# 삭제
```
helm delete -n logging prometheus 
```

<br>

# 주의사항
* grafana는 ingress path가 "/" 고정
* path변경하려면 configmap grafana.ini 수정 필요(참고자료 : https://stackoverflow.com/questions/57170106/trying-to-rewrite-url-for-grafana-with-ingress)

<br>

# exporter 목록
```sh
kubectl get ServiceMonitor -n prometheus
```

<br>

# TroubleShooting
* [문서링크](./troubleshooting.md)

# 참고자료
* [1] [prometheus helm](https://github.com/prometheus-community/helm-charts)
* [2] [helm denpendency 설치](https://github.com/helm/charts/issues/11750)