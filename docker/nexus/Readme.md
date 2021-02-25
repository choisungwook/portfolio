# 개요
* nexus

<br>

# 실행 명령어
* 포트
  * 8081: http
  * 5000: docker
* 볼륨
  * /nexus-data: nexus 데이터가 저장되는 경로
```sh
docker volume create --name nexus-data
docker run -d --rm --name nexus -p 8081:8081 -p 5000:5000 -v nexus-data:/nexus-data  sonatype/nexus3
```

<br>

# 초기 비밀번호
* mountpoint/admin.password에 설정
```
$ docker volume inspect nexus-data
[
    {
        "CreatedAt": "2021-02-24T05:05:11Z",
        "Driver": "local",
        "Labels": {},
        "Mountpoint": "/var/lib/docker/volumes/nexus-data/_data",
        "Name": "nexus-data",
        "Options": {},
        "Scope": "local"
    }
]

```

# docker insecure 설정
```
{
  "insecure-registries" : ["ip 또는 도메인:5000"]
}
```

<br>

# docker login
```sh
docker login ip:5000
```

<br>

# 참고자료

* [1] [nexus docker hub](https://hub.docker.com/r/sonatype/nexus3)
* [2] [도커 공식문서-insecure](https://docs.docker.com/registry/insecure/)