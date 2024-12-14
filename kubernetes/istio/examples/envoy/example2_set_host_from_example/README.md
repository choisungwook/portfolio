## 개요
* [예제 1](../example1_envoy_homepage/)와 비슷한 envoy설정 파일이 있습니다. envoy proxy를 호출하면 404 Not Found 응답을 받습니다.
* `실패한 이유를 찾아보고 올바른 방법으로 envoy 컨테이너를 호출`해보세요.
* curl 호출 실패 로그

```sh
$ curl 127.0.0.1:10000 -v
*   Trying 127.0.0.1:10000...
* Connected to 127.0.0.1 (127.0.0.1) port 10000
> GET / HTTP/1.1
> Host: 127.0.0.1:10000
> User-Agent: curl/8.7.1
> Accept: */*
>
* Request completely sent off
< HTTP/1.1 404 Not Found
< date: Sat, 14 Dec 2024 14:08:47 GMT
< server: envoy
< content-length: 0
<
* Connection #0 to host 127.0.0.1 left intact
```

* envoy 도커 컨테이너 로그

```sh
[2024-12-14T14:08:48.073Z] "GET / HTTP/1.1" 404 NR 0 0 0 - "-" "curl/8.7.1" "17113f41-6b16-4621-a53f-b848ea6de086" "127.0.0.1:10000" "-"
```

## 전제조건
* docker가 필요합니다.

## 정답

1. [예제 1](../example1_envoy_homepage/)과 다른 점은 route 설정입니다. 이 예제에서는 route에 host가 정적으로 설정되어 있습니다. virtual_hosts.domains 필드를 확인해보세요.

```sh
# 23번째 줄
route_config:
  name: local_route
  virtual_hosts:
  - name: envoyproxy_io
    domains: [ "envoyproxy.io" ]
    ... 이하 생략
```

2. 따라서 envoy 컨테이너에 올바르게 호출하려면, http 헤더에 Host필드를 추가해야 합니다.

```sh
curl -H "Host: envoyproxy.io" 127.0.0.1:10000
```

## 추가 문제

* 웹 브라우저에서는 어떻게 호출해야 응답을 받을 수 있을까요?

## 추가 문제 정답

* hosts파일을 변조하면 됩니다.

```sh
$ sudo vi /etc/hosts

127.0.0.1 envoyproxy.io
```

## 실습환경 정리
* 실습을 마치고 도커 컨테이너 종료

```sh
docker kill envoy
```

## 참고자료
* https://www.envoyproxy.io/docs/envoy/latest/start/quick-start/run-envoy
