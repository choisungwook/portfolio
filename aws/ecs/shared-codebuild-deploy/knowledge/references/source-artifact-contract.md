---
type: Reference
title: AWS 소스 출력과 clone 권한 근거
description: CODE_ZIP과 CODEBUILD_CLONE_REF의 공식 계약 요약
tags: [codepipeline, codebuild, s3]
timestamp: 2026-10-04T00:00:00Z
---

# AWS 소스 출력과 clone 권한 근거

- CODE_ZIP: 실행의 Source revision에 해당하는 저장소 파일 포함.
- CODEBUILD_CLONE_REF: 저장소 URL 참조 전달. 소비 가능한 후속 액션은 CodeBuild.
- CodeBuild는 저장소 파일과 Git 메타데이터를 직접 다운로드.
- CodeBuild Role에도 선택한 connection의 UseConnection 필요.
- 파일 경로 필터는 Pipeline 실행 조건. 소스 전달 파일 범위를 지정하지 않음.

## Citations

1. [Source action 계약](https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodestarConnectionSource.html).
2. [CodeBuild GitClone 연결 권한](https://docs.aws.amazon.com/codepipeline/latest/userguide/troubleshooting.html#codebuild-role-connections).
3. [GitHub full clone 실습](https://docs.aws.amazon.com/codepipeline/latest/userguide/tutorials-github-gitclone.html).
4. [Pipeline 트리거 필터](https://docs.aws.amazon.com/codepipeline/latest/userguide/pipelines-triggers.html).
