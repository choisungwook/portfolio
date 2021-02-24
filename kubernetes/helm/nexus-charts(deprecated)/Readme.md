# 1. 개요
* helm nexus
    * nexus는 StatefulSet로 실행
* nexus-proxy 사용 X

<br>

# 2. 설정
> values.yaml파일에 설정 수정
## 2.1 동적 불륨 프로비저닝
* 온프레미스인 경우 storageclass nfs설정: nfs서버 필요
* 퍼블릭 클라우드는 각 클라우드에 맞는 storageclass설정
## 2.2 pv, pvc 설정
```yaml
persistence:
  storageSize: 8Gi  
  # storageClass: ""
  storageClass: "nfs"
  accessMode: ReadWriteOnce
```
## 2.3 ingress
* ingress subpath를 변경할 경우("/"이외 사용하는 경우) nexus pod의 NEXUS_CONTENT를 subpath와 일치하게 설정
```yaml
ingress:
  enabled: true
  annotations: {}
    # kubernetes.io/ingress.class: nginx
    # kubernetes.io/tls-acme: "true"
  env:
    - name: NEXUS_CONTEXT
      value: nexus
  hosts:
    - host: "helloworld.com"
      paths: 
        - path: "/nexus"
  tls: []
  #  - secretName: chart-example-tls
  #    hosts:
  #      - chart-example.local
```

## 2.4 service 
* 설정위치: charts/values.yaml
```yaml
service:
  type: NodePort
  port: 8081
  targePort: 8081
  nodePort: 32000
```

<br>

# 3. 설치
## 3.1 설치
* nexus namespace 사용
```sh
helm install -n nexus -f values.yaml --dependency-update --create-namespace nexus ./charts
```

## 3.2 접속
* ingress-controller 서비스
![](./imgs/svc.png)

* nexus-ingress 확인
![](./imgs/nexus_ingress.png)

* nexusd-ingress 접속
![](./imgs/success.png)

<br>

# 4. 삭제
```sh
helm uninstall -n nexus nexus
```

<br>

# 5. 기본 계정
* 계정: admin
* 비밀번호: admin123

<br>

# 6. 참고자료
* [1] stackoverflow-nexus external_url configuration: https://stackoverflow.com/questions/42058873/nexus-3-2-base-url-is-ignored
* [2] redhat-nexus helm: https://github.com/Oteemo/charts/tree/master/charts/sonatype-nexus