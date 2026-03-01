# what is tmpfs?

## 개요

이 디렉터리는 리눅스 `tmpfs`가 메모리 사용률 알람 오탐을 만들 수 있는 상황을 설명하는 핸즈온입니다.

## 핸즈온 방법

### 1. 테스트 환경 구축

docker container로 테스트환경을 구축합니다.

```sh
make up
```

### 2. 테스트 진행

- (옵션1) [리눅스 명령어로 직접 핸즈온](docs/manual-test.md)
- (옵션2) [스크립트로 핸즈온](docs/load-test-script-test.md)

## 3. 실습환경 정리

```sh
make down
```
