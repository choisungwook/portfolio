# 개요
* nexus-helm

<br>

# 준비
* helm3 설치

<br>

# 실행 방법
```sh
helm install -n [namespace] --create-namespace nexus .
```

<br>

# 삭제
```
helm uninstall -n [namespace] nexus
```

<br>

# 설정
| Parameter | Description |	Default |
| -------- | ------------ | --------- |
| image.repository | image name | sonatype/nexus3 |
| image.tag | image tag | latest |
| persistence.storage | 용량 | 3Gi |
| persistence.mountpath | 마운트 경로 | /mnt/nexus-data |
| persistence.storageClass | storageclass | nil |
| service.type | service type | NodePort |
| service.httpport | nexus http port | 80 |
| service.dockerport | nexus docker port | 5000 |
