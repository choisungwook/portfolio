# AI 자막 추출과 무음 제거

- Issue: #679, #678
- Branch: codex/issue-679-ai-editing

## 실행 계획

- [x] 1. 요구사항·선행 Issue·공급자 API와 기존 편집 구조 분석
- [x] 2. 취소 가능한 AI 작업과 공급자 중립 전사·무음 분석 백엔드 구현
- [x] 3. 자막 삽입·무음 제거를 단일 undo 편집 트랜잭션으로 연결
- [x] 4. Edit > AI 메뉴와 오른쪽 Captions UI, 모델·effort 설정 구현
- [x] 5. 버전·ADR·knowledge 갱신과 Rust·프런트엔드·브라우저 검증
- [x] 6. 사람이 익혀야 할 AI audio 아키텍처와 의사결정을 human-wiki에 기록

## 다음 세션이 알아야 할 것

- 자막 UI는 별도 창 대신 기존 오른쪽 AI 패널의 Captions 화면 사용
- 전사 결과는 공급자 중립 segment 형식으로 정규화
- OpenAI 호환 transcription endpoint와 Google·Azure API를 직접 지원하고 LiteLLM gateway도 제공
- LM Studio 2026-09 공식 OpenAI 호환 endpoint에는 audio transcription이 없어 기본 지원 대상에서 제외
- 기본 전사 모델은 whisper-1, 오디오 전처리는 mono 16 kHz 저용량 MP3
- Codex 대화 모델 기본값은 Luna, reasoning effort는 medium
- `akbun-makepresentation/human-wiki`에 AI audio 학습 문서와 유지 규칙 추가
