---
type: Decision
title: 모노레포 소스 전달을 clone 참조로 전환
description: 전체 소스 ZIP의 반복 저장을 줄이면서 실행 커밋을 검증하는 선택
tags: [codepipeline, codebuild, s3]
timestamp: 2026-10-04T00:00:00Z
---

# 모노레포 소스 전달을 clone 참조로 전환

## 결정

- CodePipeline Source의 출력은 CODEBUILD_CLONE_REF 사용.
- CodeBuild는 CODEPIPELINE 입력 유지. 선택한 connection ARN의 UseConnection 권한 추가.
- buildspec에서 Git HEAD와 전달된 Source revision 일치 검사.
- ZIP 방식과의 비교는 Git commit과 실행별 S3 객체로 보존.

## 이유

- 배포 디렉터리 지정은 전체 저장소 ZIP 크기를 줄이지 않음.
- 별도 저장소 분리 대신 모노레포 구조를 유지하면서 S3 저장량 감소.
- 코드 다운로드는 CodeBuild로 이동. 필요한 디렉터리만 가져오는 방식으로 해석하면 안 됨.
- CodeBuild 연결 권한이 없으면 Source가 성공해도 clone에서 실패 가능.
- Git HEAD 검사는 참조 전달 성공과 실행 코드 일치를 함께 확인.

## Citations

1. [AWS 소스 출력과 clone 권한 근거 사본](../references/source-artifact-contract.md).
