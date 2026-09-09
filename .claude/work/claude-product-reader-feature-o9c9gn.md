# reader 원본을 graphify wiki로 만드는 별도 앱과 읽기 전용 토큰

- Issue: 미생성
- Branch: claude/product-reader-feature-o9c9gn

## 실행 계획

- [x] 1. graphify 실행 조건 조사 — Python CLI, 문서 추출에 LLM 키 필요, Worker에서 실행 불가
- [x] 2. akbun-reader: api_tokens.scope(read/write) migration, 인증 분기, 설정 화면, 테스트, 버전 0.8.0
- [x] 3. akbun-reader: wiki/adr/knowledge에 읽기 전용 토큰 결정 기록
- [x] 4. product/akbun-wiki 생성: reader 동기화(raw markdown), graphify 빌드, SQLite 인덱스, API 키 인증, FastAPI
- [x] 5. akbun-wiki wiki/adr/knowledge/README, verify workflow
- [x] 6. product/README.md, 루트 README.md, products.json 갱신
- [x] 7. 테스트 통과 확인 후 commit, push

## 다음 세션이 알아야 할 것

- graphify export wiki는 graph.json 옆 graphify-out/wiki/에 index.md와 article을 씀
- graphify extract는 markdown 추출에 --backend와 API 키 필요, --code-only는 md를 건너뜀
- 제품 이름 akbun-wiki는 가정. 사용자가 다른 이름을 고르면 디렉터리·인덱스 3곳·workflow 이름을 함께 바꿈
