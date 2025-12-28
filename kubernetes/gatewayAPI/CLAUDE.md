# 개요

- 이 프로젝트는 kubernetes gateway API 입문레벨 핸즈온입니다.

## contexts

- 실습환경은 두개입니다.
  - 맥북 ARM에서 kind cluster와 envoy gateway, metallb를 사용합니다. metallb는 envoy gateway가 생성하는 loadbalancer타입 service를 실행하기 위해 사용합니다.
  - EKS와 ALB controllr v2.17 이상(ref: https://kubernetes-sigs.github.io/aws-load-balancer-controller/latest/guide/gateway/gateway/)을 사용합니다. EKS환경에선느 AWS ALB controller을 활용하여 gatewayAPI를 사용하는게 목적입니다. 2025.12기준으로 ALB controller와 gatewayAPI호환이 테스트단계여서 프로덕션에 사용을 못하지만, 핸즈온이 목표입니다.
