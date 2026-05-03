# For Agents

## 공통 규칙

- Python: `uv` 로 의존성 관리, indent 2.
- OpenAI 모델: 기본값 `gpt-4.1-nano` (비용 절감).
- `.env.example` → `cp .env.example .env` 로 환경변수 셋업, `.env` 는 루트 `.gitignore` 에 등록됨.
- 실행은 각 챕터 디렉터리의 `make build` → `make <target>` 순서.
