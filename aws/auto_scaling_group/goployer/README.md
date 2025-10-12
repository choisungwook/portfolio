# 개요

* goployer 연습
* goployer link: https://github.com/DevopsArtFactory/goployer

## 요약

* goployer는 AWS ASG를 사용하여 EC2를 배포하는 오픈소스입니다.

## 준비

* EC2 security group, IAM instance profile, ELB, ELB Target group이 필요합니다.
* goployer는 ELB에 연동할게 될 경우, ASG동착처럼 ELB Target group에 연동됩니다.

## ASG 생성

```sh
goployer deploy \
  --manifest=manifests/demo.yaml \
  --disable-metrics=true \
  --stack=example1
```

## ASG 삭제

```sh
goployer delete \
  --manifest=manifests/demo.yaml \
  --disable-metrics=true \
  --stack=example1
```
