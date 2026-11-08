# 터미널 CLI

- 실행 중인 편집기를 터미널에서 직접 조작하는 akbun-makevideo 명령
- MCP 서버와 같은 사용자 전용 Unix socket과 같은 메서드 사용. AI 클라이언트 없이 스크립트로 반복 작업 가능
- Node.js 22 이상만 필요. 설치할 의존성 없음
- 결과는 JSON. 터미널에서는 들여쓰기, 파이프로 넘기면 한 줄

## 설치

저장소의 workspace에서 전역 명령으로 연결.

```bash
cd /path/to/portfolio/product/akbun-makevideo/workspace
npm link
akbun-makevideo --help
```

- 연결 없이 실행할 때는 node cli/akbun-makevideo.mjs <명령>

## 기본 흐름

앱 상태를 확인하고 꺼져 있으면 연다.

```bash
akbun-makevideo status
akbun-makevideo launch
```

현재 프로젝트를 요약해서 asset과 track ID를 확인한다.

```bash
akbun-makevideo project --summary
```

편집 명령을 JSON 배열 파일로 검증한 뒤 적용한다. 형식은 akbun-makevideo guide에 있다.

```bash
echo '[{"op":"splitAt","frame":90}]' > edits.json
akbun-makevideo preview edits.json
akbun-makevideo apply edits.json --label "첫 컷"
```

- 파일 대신 - 를 주면 표준 입력에서 읽음
- 적용마다 복구 지점이 먼저 저장되고 결과에 checkpointId가 옴. 되돌리기는 akbun-makevideo restore <checkpointId>

저장하고 출력이 끝날 때까지 기다린다.

```bash
akbun-makevideo save ~/Documents/akbun-makevideo/trip/project.akbunvideo
akbun-makevideo export ~/Movies/trip.mp4 --preset fhd --quality high --wait
```

- --wait 없이 시작만 하고 akbun-makevideo render-status로 확인 가능
- 출력 실패 시 종료 코드 1

## stateToken

- 편집 명령은 stateToken이 현재 프로젝트와 맞을 때만 적용
- --token을 생략하면 CLI가 실행 직전의 최신 값을 읽어서 사용. 앱에서 손으로 편집한 직후에도 그대로 동작
- 스크립트가 읽은 상태 그대로를 보장해야 하면 project 결과의 stateToken을 --token으로 전달. 그 사이 바뀌었으면 거부

## 명령 목록

| 명령 | 하는 일 |
| --- | --- |
| status / launch | 실행 여부·버전·렌더·프록시 상태 / 앱 열기 |
| guide | 편집 명령 형식과 시간 규칙 |
| project [--summary] / projects | 현재 프로젝트 / workspace 목록 |
| open / new / save / import | 프로젝트 열기·새로 만들기·저장, 미디어 참조 추가 |
| preview / apply / undo / redo | 편집 검증·적용·실행 취소·재실행 |
| checkpoints / checkpoint / restore | 복구 지점 목록·생성·복원 |
| sample <assetId> --start --end [--out] | 구간의 JPEG 프레임 저장 |
| library | 저장된 디자인 템플릿과 B-roll 메모 |
| export / render-status / cancel-render | 출력 시작·상태·취소 |

## 종료 코드

| 코드 | 의미 |
| --- | --- |
| 0 | 성공. status는 앱이 꺼져 있어도 running=false로 0 |
| 1 | 편집기가 거부하거나 연결 실패, 출력 실패 |
| 2 | 잘못된 명령이나 인자 |
