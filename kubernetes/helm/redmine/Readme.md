- [개요](#개요)
- [헬름 저장소 추가](#헬름-저장소-추가)
- [설정](#설정)
  - [global](#global)
  - [persistence](#persistence)
  - [database](#database)
  - [service](#service)
- [설치](#설치)

# 개요
* redmine 설치

# 헬름 저장소 추가
```sh
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
```

<br>

# 설정
## global
storageclass를 변경해서 사용할 경우 global.storageclass를 변경해야합니다. 아래 예제는 nfs-storage를 storageclass로 사용했습니다.
```yaml
global:
  storageClass: nfs-storage
```

## persistence
기존재 존재하는 pvc를 연결할 수 있거나, 동적 프로비저닝이 활성화 되어 있다는 전제로 pv와 pvc를 생성합니다.
```yaml
# 동적 프로비저닝 활성화
persistence:
  storageClass: 
    storageClass: nfs-storage
    size: 20Gi
```

## database
이 헬름은 자동으로 mariadb를 설치하고 연동합니다. 선택적으로 외부 mariadb 또는 postgresql를 연결할 수 있습니다. <br>
일반 계정과 root비밀번호를 설정할 수 있습니다.
```yaml
mariadb:
  auth:
    password: password1234
    rootpassword: password1234
```

동적 프로비저닝이 활성화 된 경우, persistence를 연동할 수 있습니다.
```yaml
mariadb:
  primary:
    persistence:
      storageClass: nfs-storage
      size: 20Gi
```

## service
기본 서비스타입은 로드밸런서입니다. public cloud 또는 로드밸런서에 할당할 IP가 없다면 nodeport로 설정하는 것을 권장합니다. 또는 clusterIP를 설정하고 ingress 연동하는 방법도 있습니다.
```yaml
service:
  type: NodePort
```

<br>

# 설치
```
kubectl create ns redmine
helm install redmine -n redmine -f override_values.yaml bitnami/redmine
```