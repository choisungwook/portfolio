# Astra 편집 스튜디오

## 편집 순서

1. AI → Edit studio → Prepare에서 전사 생성과 B-roll 구간 분석
2. Story에서 반복 발화·불필요한 구간 정리 제안, 삭제 구간을 눌러 원본 확인
3. Apply edits 후 미리보기 확인, Layers에서 B-roll·모션 그래픽·음악 추가 제안
4. Finish에서 자막 스타일 적용, 선택한 text/shape 디자인 저장
5. 기존 Render 메뉴에서 영상 내보내기

## 모델과 데이터

- Codex App Server의 ChatGPT 로그인 사용
- 편집·시각 분석 모델은 GPT-6 Astra, reasoning은 high
- 계정의 model/list에 Astra가 없으면 모델을 대체하지 않고 안내
- 일반 Conversations의 모델 설정과 편집 모델을 분리
- 편집 요청마다 새 ephemeral thread 사용
- 편집 문맥: 파일 경로를 제외한 프로젝트·자막·선택 항목·B-roll 설명
- B-roll 문맥: 선택한 원본 구간의 JPEG 8장, 최대 640px
- 분석 구간은 최대 60초, 이미지는 한 장만 사용
- 파일 크기·수정 시간 fingerprint가 달라지면 기존 분석을 편집 문맥에서 제외
- 샘플 사이의 사건이나 음성을 추정하지 않도록 요청

## 적용 경계

- 모델 응답은 구조화된 편집 제안이며 직접 실행되지 않음
- Rust allowlist로 허용 명령만 수용, 최대 256개
- 별도 Document에서 명령 전체를 사전 검증
- 적용 시 원본 snapshot과 revision 재검사
- 실제 Document에 단일 transaction으로 적용
- 실패·취소·오래된 결과는 편집에 반영하지 않음
- 전사·무음 제거 작업 중에는 기존 편집 잠금 유지

## 그래픽 라이브러리

- 앱 데이터의 editing-library/library.json에 최대 4 MiB 저장
- text/shape는 내용·transform·키프레임·원본 canvas·frame rate 저장
- 재사용 시 시간축과 위치·크기를 대상 프로젝트에 맞춰 변환
- subtitle의 text를 저장하면 전체 자막 트랙에 재사용할 스타일로 보관
- 영상·이미지 파일 참조는 템플릿에 저장하지 않음
- 템플릿 삭제는 이미 적용한 타임라인에 영향을 주지 않음

## 범위와 제한

- B-roll 분석은 전체 프레임 분석이 아닌 표본 설명
- 전사는 별도 speech provider와 과금 사용
- 음악·효과음·이미지는 먼저 가져온 에셋 사용
- 그래픽은 기존 text/shape/키프레임으로 표현하며 임의 코드를 실행하지 않음
- 자막 스타일 재사용은 시각 스타일에 한정, 단어 단위 음성 정렬을 생성하지 않음
- 프로젝트 문맥은 160,000자 제한, 큰 프로젝트는 나눠 편집

## 검증

- Node: 문맥 경로 제거, 명령 제한, 분석 timestamp, 템플릿 비율·시간 변환
- Rust: stale 거부, 실패 시 무변경, transaction undo/redo
- 실제 Astra 텍스트 응답을 고정 fixture로 저장해 편집 모델과 연동 검증
- 내장 브라우저: 검토·적용·미리보기·템플릿 UI를 테스트 데이터로 검증
