# 개요
* kubernetes nexus 리소스

<br>

# 실행방법
```
kubectl apply -f .
```

<br>

# 삭제
```
kubectl delete -f
```

<br>

# 설정
## persistentvolume
* 마운트경로: hostpath 수정
* 용량: capacity 수정

## persistentvolume
* default Storage를 사용하므로 claimRef 생략

## service
* nodePort: 포트번호 수정

<br>

# 쿠버네티스 private 도커 레지스트리 등록
* .dockerconfigjson내용에는 "~/.docker/config.json" 내용을 설정
  * config.json파일은 private 도커 레지스트리에 로그인 성공해야 생성됨
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: myregistrykey
data:
  .dockerconfigjson: UmVhbGx5IHJlYWxseSByZWVlZWVlZWVlZWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGxsbGx5eXl5eXl5eXl5eXl5eXl5eXl5eSBsbGxsbGxsbGxsbGxsbG9vb29vb29vb29vb29vb29vb29vb29vb29vb25ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubmdnZ2dnZ2dnZ2dnZ2dnZ2dnZ2cgYXV0aCBrZXlzCg==
type: kubernetes.io/dockerconfigjson
```

<br>

# 참고자료
* [1] [nexus docker hub](https://hub.docker.com/r/sonatype/nexus3)
* [2] [쿠버네티스 공식문서-도커레티스트리 등록](https://kubernetes.io/ko/docs/tasks/configure-pod-container/pull-image-private-registry/)