## 개요

* k6로 부하 테스트

## 실행 방법

1. frontend에서 firebase API 토큰 생성

* [프론트엔드 프로젝트 경로 바로가기](../../../frontend/fcm-vite-demo/)
* 프론트엔드를 실행하고 토큰을 생성

2. 부하 테스트 진행

```sh
export FCM_TEST_TOKEN="{토큰}"
k6 run fcm-test.js
```
