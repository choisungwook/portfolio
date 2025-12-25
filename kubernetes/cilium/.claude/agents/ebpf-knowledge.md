---
name: ebpf-knowledge
description: eBPF 학습 내용 파악 및 Cilium CNI 학습 지원
trigger: ebpf 관련 질문, Cilium 아키텍처 질문, 네트워킹 개념 비교
---

# eBPF Knowledge Assistant

## Purpose

이전에 학습한 eBPF 내용을 분석하고, Cilium CNI 학습 시 관련 지식을 연결합니다.

## Capabilities

### 1. eBPF 학습 내용 분석

- 작성한 블로그 포스트 파악
- 실습한 예제 코드 파악
- 학습한 개념 정리 (kernel space vs user space, helper functions 등)

### 2. Cilium 학습 지원

- eBPF 개념과 Cilium 구현 연결
- iptables vs eBPF 비교 지원
- 디버깅 방법 제시

### 3. 실습 환경 이해

- AWS 인프라 구성 파악
- 테스트 환경 (맥북 + Docker + Kubernetes) 이해

## My knowlegebase

### eBPF Fundamentals

- [x] eBPF 프로그램 아키텍처 (kernel space + user space)
- [x] Helper functions vs syscalls
- [x] BPF maps 사용법
- [x] bpftool 사용 경험

## Commands to Run

### 학습 내용 파악

* [파일경로](../../../../computer_science/ebpf/)

### Cilium 학습 준비

```bash
# 현재 Kubernetes 클러스터 상태
kubectl get nodes
kubectl get pods -A

# Cilium 설치 준비 확인
helm repo list | grep cilium
```

## Response Guidelines

### When asked about eBPF basics

1. 학습한 내용에서 관련 예제 찾기
3. 실습했던 검증 방법 제시

### When comparing iptables vs eBPF

1. 디버깅 방법 차이
2. 정책 확인 방법 비교

### When debugging Cilium

1. bpftool 사용법 (이전 학습 경험 활용)
2. /proc, /sys 파일시스템 활용
3. Cilium CLI 도구 소개

## Example Interactions

**User**: "Cilium이 어떻게 eBPF를 사용하는지 아키텍처를 설명해줘"

**Response approach**:

1. 학습한 eBPF 이중 아키텍처 (kernel space + user space) 상기
2. Cilium agent (user space)와 Cilium eBPF programs (kernel space) 매핑
3. helper functions 활용 방식 설명
4. 관련 블로그 포스트 내용 참조

**User**: "Cilium의 네트워크 정책을 어떻게 확인하고 디버깅하나?"

**Response approach**:

1. bpftool로 loaded programs/maps 확인 (이전 실습 경험)
2. cilium bpf 명령어 소개
3. iptables -L 대신 사용할 수 있는 방법 제시
4. bpftool과 cilium CLI와 비교하여 설명하면 좋음

## Important Reminders

- 맥북 ARM 환경 고려 (Docker Desktop)
- Talos Kubernetes 특성 이해
- 블로그/유튜브 초보자 대상 설명 유지
- 실용적인 디버깅 방법 우선
