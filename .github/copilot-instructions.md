# 코드 리뷰 지침

Copilot code review와 PR 직전 서브에이전트 리뷰가 같이 읽는다. 저장소가 무엇인지와 작성 규칙은 [AGENTS.md](../AGENTS.md)에 있다. 이 파일은 리뷰어가 무엇을 찾고, 무엇을 버리고, 어떤 형식으로 올리는지만 정한다.

## 우선순위

1. 돌리면 틀리는 것을 잡는다. 실행하면 실패하는 코드, 따라 하면 재현되지 않는 문서.
2. 리뷰 라운드를 줄인다. 한 번에 다 말하고, 이미 올린 지적은 반복하지 않는다.
3. 스타일, 정리, 취향은 올리지 않는다. lint가 잡는 것은 lint에 맡긴다.

## 실패의 모습

영역마다 "틀렸다"가 다르다. 아래 모습을 찾고, 여기에 없는 종류는 올리지 않는다.

- 핸즈온 문서(docs/*.md, README.md): 문서가 거짓말을 한다. 적힌 명령, 파일 경로, 변수 이름, 포트가 같은 PR의 코드와 다르다. 링크가 없는 파일을 가리킨다. setup 절차가 내용 문서에 섞여 있다.
- Terraform(*.tf): 인스턴스 크기처럼 바뀔 값이 하드코딩됨. 리소스 이름이 main이나 this. 리전이 ap-northeast-2가 아닌데 이유가 없음.
- Kubernetes(manifests/): 같은 디렉터리의 다른 manifest와 label, namespace, 포트가 어긋남. 문서가 설명하는 동작과 manifest가 다름.
- GitHub Actions(.github/workflows/): permissions 없음. PR 제목이나 body 같은 외부 입력을 run 스크립트에 직접 넣음. action이나 도구 버전이 같은 디렉터리의 다른 workflow보다 낮음.
- product/: workspace/ 아래를 고쳤는데 버전을 안 올림. 새 디렉터리를 만들었는데 product/README.md, 루트 README.md, products.json 중 하나라도 안 고침.
- 규칙 파일(AGENTS.md, .claude/, .github/*.md): 같은 규칙이 두 파일에 적힘. 다른 규칙 파일과 모순됨. 링크 대상 파일이 없음. 모델이 알아서 하는 일을 지시함.
- PR body: 검증 절이 Issue의 완료 조건에 답하지 않음. 실행하지 않은 검증을 통과로 적음. 리스크 절이 없거나, 있는데 어느 검사가 못 잡는지가 없음.

## 깊이 보는 경로

아래는 한 번 틀리면 이후 모든 PR이나 모든 사용자에게 번진다. 다른 경로보다 호출 경로를 끝까지 따라간다.

- .github/workflows/: 모든 PR과 release에 돈다.
- product/products.json: master에 들어가는 순간 사이트에 반영된다.
- AGENTS.md, .claude/rules/, .claude/rule-details/, 이 파일: 이후 모든 세션이 읽는다.

## 건너뛸 경로

- unused/, wikiimgs/, pcap_files/
- *.lock, package-lock.json, uv.lock, Cargo.lock
- 삭제만 있는 파일

## finding 형식

- 근거는 파일과 줄이다. 이름이나 주석만 보고 추측하지 않는다. 호출자나 입력에서 실패까지 경로를 따라갈 수 없으면 올리지 않는다.
- finding마다 태그를 하나 붙인다. Important는 돌리면 틀리거나 문서가 거짓말하는 것. Nit은 고치면 좋지만 머지를 막지 않는 것. Pre-existing은 이 PR이 만들지 않은 기존 문제.
- Nit은 PR당 3개까지만 올린다. 넘치면 영향이 큰 순으로 자른다.
- Pre-existing은 작성자 탓으로 쓰지 않는다. 별도 Issue 후보라고 표시하고 이 PR에서 고치라고 하지 않는다.
- 같은 종류의 문제가 여러 곳이면 하나로 묶어 한 번만 올리고, 다른 위치는 그 아래 목록으로 붙인다.
- 재요청된 리뷰는 지난 리뷰 이후 바뀐 diff만 본다. 이미 올린 지적은 반복하지 않는다.

## 요약 형식

- 첫 줄은 건수다. Important N, Nit N, Pre-existing N.
- 올릴 것이 없으면 "지적 없음"이라고 쓴다. 비워 두거나 칭찬으로 채우지 않는다.
- 한글 개조식으로 쓴다. 종결어미(-다, -한다)를 쓰지 않고 명사나 -음, -함으로 끝낸다.
