# UI/UX 개선 제안

- [HTML 비교 시안](./index.html)
- [영어 PNG 미리보기](./proposal.png)
- [한국어 PNG 미리보기](./proposal-ko.png)
- [화면 설계 기준과 스킬 출처](./DESIGN.md)
- [검증 결과](./verification.md)

## 확인

- HTML 상단에서 개선안과 현재 화면 전환.
- 기본 언어는 영어. 상단 Language에서 English·한국어 선택.
- 선택한 언어는 새로고침 후에도 유지.
- 슬라이드 내용과 입력 중인 문구는 언어 전환 시 원문 유지.
- 개선 이유에서 UI·UX 개념과 변경 목적 확인.
- 도형 이동·텍스트 편집·속성 변경·실행 취소·슬라이드 추가 가능.
- 저장·내보내기·AI 실행은 데스크톱 앱에서 사용.
- 예제의 편집 내용은 메모리에만 유지되며 새로고침 시 초기화.
- 앱 소스 수정 없이 workspace/src의 편집 로직 사용.

## 재생성

저장소 루트에서 HTML 파일 재생성:

```sh
node product/akbun-makepresentation/design-proposal/build-proposal.mjs
```

저장소 루트에서 로컬 서버 기동:

```sh
uv run --no-project --python python3 -m http.server 8765 --bind 127.0.0.1
```

- 주소: <http://127.0.0.1:8765/product/akbun-makepresentation/design-proposal/>.
- index.html은 인접 CSS·JS 및 workspace/src 파일 참조.
- 다른 위치에 전달할 때는 PNG 사용 또는 참조 파일 함께 제공.
