# Agent Guide

## 목적

- 이 이미지는 Hermes 또는 Codex 계열 작업 환경에서 Graphify CLI와 vault 조회용 NotesMD CLI를 바로 쓰기 위한 custom 컨테이너 이미지다.
- base image는 태그만 쓰지 말고 반드시 digest를 유지한다.
- `7cb03...`은 `linux/amd64`, `8e496...`은 `linux/arm64` digest다.
- 이미지 tag는 빌드 날짜와 revision으로 관리한다. 예: `20260614-v1`, `20260614-v2`.

## 파일 역할

- `Dockerfile`: base image digest, 설치할 CLI, 최소 검증 명령을 관리한다.
- `Makefile`: 로컬 build, multi-arch buildx push, 이미지 검증 명령을 제공한다.
- `AGENTS.md`: 다음 agent가 이 디렉터리의 의도와 수정 범위를 빠르게 파악하기 위한 문서다.

## 수정 원칙

- version pin을 사용
- Graphify 패키지명은 `graphifyy`이고 실행 파일은 `graphify`
- NotesMD CLI는 `notesmd-cli`이고 `/usr/local/bin/obsidian` wrapper로 조회용 subset을 제공
- pip/npm 설치 cache는 최종 layer에서 제거한다.
- Obsidian 공식 CLI는 공식 문서 기준 데스크톱 앱 1.12+에서 Settings -> General -> Command line interface를 켜야 등록된다. 이 이미지는 공식 CLI 대신 NotesMD CLI wrapper를 사용한다.

## 빌드 테스트

- 로컬 테스트는 `make build` 후 `make verify`로 확인
