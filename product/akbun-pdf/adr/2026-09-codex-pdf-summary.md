# ChatGPT 인증과 승인 기반 PDF AI 요약

## 결정

- 설치된 Codex CLI의 App Server와 JSON-RPC로 연결
- Codex CLI의 ChatGPT 인증만 사용
- 기본 모델은 GPT-5.6 Luna, 추론 수준은 `low`
- AI 설정에서 Luna, Terra, Sol 선택과 시스템 프롬프트 편집 지원
- 현재 페이지, 직접 범위, 전체 페이지를 썸네일 dialog에서 선택
- 요약 실행 전에 대상 페이지와 모델을 별도 dialog에서 승인
- 승인한 페이지의 PDF.js 추출 텍스트와 렌더링 이미지를 함께 전달
- 전체 문서는 6페이지씩 요약한 뒤 최종 종합
- Codex thread는 휘발성으로 만들고 앱이 대화를 JSONL로 저장
- OCR은 #1144, OpenAI 호환 로컬 endpoint는 #1166에서 분리

## 이유

- 별도 API key 없이 사용자의 기존 ChatGPT 인증 재사용
- 페이지 전송 범위를 실행 직전에 명시적으로 확인
- 텍스트 계층이 없거나 레이아웃이 중요한 페이지도 이미지로 보완
- 긴 문서를 모델 입력 한도와 무관하게 예측 가능한 단위로 처리
- Codex thread 수명과 무관하게 대화를 다시 열고 이어서 사용
