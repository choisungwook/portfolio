# 개요
* nexus-helm

# 설정
| Parameter | Description |	Default |
| -------- | ------------ | --------- |
| image.repository | image name | sonatype/nexus3 |
| image.tag | image tag | latest |
| persistence.storage | 용량 | 3Gi |
| persistence.mountpath | 마운트 경로 | /mnt/nexus-dasta |
| persistence.storageClass | storageclass | nil |
| service.type | service type | NodePort |
| service.httpport | nexus http port | 80 |
| service.dockerport | nexus docker port | 5000 |