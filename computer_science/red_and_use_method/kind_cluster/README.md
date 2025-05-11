## 개요
* kind 클러스터 생성

## 전제조건
* docker가 설치되어 있어야 합니다.
* kind CLI가 설치되어 있어야 합니다.

## kind 클러스터 생성

```sh
kind create cluster --config kind-config.yaml
```

## kind 클러스터 삭제

```sh
kind delete cluster --name fcm
```
