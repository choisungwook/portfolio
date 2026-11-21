# akbun-taskq 0.17.0

## Added

- 설정 > 업데이트: 설치된 버전과 GitHub의 최신 akbun-taskq release를 보여 준다. 단일 바이너리로 돌면 설치 버튼으로 이 Mac(darwin-arm64)이나 linux-x64용 빌드를 받아 실행 파일을 바꾸고, 다시 시작하면 새 버전이 된다. 다운로드나 압축 풀기가 실패하면 실행 파일은 그대로다.
- 워크플로 편집기: 머리글에 취소·저장 버튼, 단축키(⌘/Ctrl+S 저장, Esc 취소, Alt+1–4 단계 추가). 바뀐 것이 있으면 나가기 전에 묻는다.

## Fixed

- OpenAI bot on Bedrock: 모델 목록을 AWS 프로파일로 조회한 inference profile(`ListInferenceProfiles`)로 채운다. `openai.*` 모델 ID를 고르거나 입력하면, 그 region에 맞는 `us.`(또는 `eu.`, `apac.` 등)이나 `global.` profile이 있을 때 그 ID로 바꿔 부른다. 새 OpenAI 모델은 profile로만 호출돼 그대로 쓰면 실패하던 문제다. API 키(`AWS_BEARER_TOKEN_BEDROCK`)만 쓰면 목록을 조회할 수 없어 내장 목록과 입력한 ID를 그대로 쓴다.

## SDK

OpenAI Agents SDK 호출 방식은 같고, Bedrock에서 넘기는 `model` 값만 inference profile ID가 될 수 있다.
