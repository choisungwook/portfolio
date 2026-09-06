# 프레젠테이션 독립 실행과 편집 기능 확장

- Issue: 생성 예정
- Branch: codex/presentation-multi-document

## 실행 계획

- [x] 1. 최신 master 반영, 규칙과 기존 구조 확인
- [x] 2. 파일별 독립 실행과 운영체제 클립보드 구현
- [x] 3. 검색, 확대 단축키, 도형 선택 개선, 말풍선 구현
- [x] 4. 브라우저·모델·네이티브 경계 검증과 문서·버전 갱신
- [ ] 5. Issue·PR 생성, Copilot 리뷰 반영, CI 확인, squash merge와 Issue 종료

## 다음 세션이 알아야 할 것

- 대상 경로는 product/akbun-makepresentation
- CLI GitHub 인증 확인 완료
- 검색 범위는 전체 슬라이드 텍스트·코드, 외부 복사 형식은 PNG·텍스트로 가정
- 사용자 결정: 설정·저장 AI 대화까지 파일별로 분리
- 브라우저 검증: 말풍선 생성·텍스트, 검색·이동, Cmd+=/-, 빈 도형 밖 클릭·내부 드래그 통과
- 개발용 QA 식별자로 cargo build 완료. 설치 패키지·업데이터·서명 생성하지 않음
- 네이티브 검증 완료: 별도 PID 2개, 원본 종료 후 자식 앱 유지, PPTX 저장·재열기, 프로세스 간 편집 가능한 말풍선 붙여넣기, Preview PNG 열기, Cmd+=/Cmd++/Cmd+-
- 최종 테스트: JS 142개, Rust 덱 15개·프로필 3개·공통 AI 9개, cargo check 통과
- 버전 0.24.0, 파일별 프로필·검색·클립보드 문서 갱신
- Native WebView에서 기존 inline swatch CSS와 IPC 우회 경고 관찰. 기능은 정상이며 CSP 완화하지 않음
