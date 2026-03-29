# Karpenter 커스텀 AMI 테스트

## 개요

Karpenter가 커스텀 AMI로 노드를 프로비저닝할 때 NodeConfig를 자동 생성하는지 확인하는 테스트입니다.

## 문서

| 문서 | 설명 |
|------|------|
| [install.md](./install.md) | Karpenter Helm 설치 및 테스트 가이드 |

## 파일 목록

| 파일 | 설명 |
|---|---|
| `values.yaml` | Helm static values (replica 1, HA 비활성화) |
| `ec2nodeclass.yaml.template` | EC2NodeClass 템플릿 (`envsubst`로 값 치환) |
| `nodepool.yaml.template` | NodePool 템플릿 |
| `inflate.yaml.template` | 테스트용 inflate Deployment (CPU 2코어 요청) |
