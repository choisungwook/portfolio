# Product 규칙

`product/`는 핸즈온이 아니라 완성형 도구와 제품을 모아 두는 디렉터리다.

## 인덱스 갱신

`product/` 아래에 새 디렉터리를 만들면 같은 commit에서 세 인덱스를 갱신한다.

1. `product/README.md`의 인덱스 테이블에 항목을 추가한다.
2. 루트 `README.md`의 "직접 만든 제품" 섹션 목록에 항목을 추가한다. 형식은 `- [설명](./product/<디렉터리>/) (작성날짜)`를 따른다.
3. `product/products.json`의 `products` 배열에 항목을 추가하고 `updated`를 오늘 날짜로 바꾼다. 항목 형식은 [.claude/commands/repo-pr-create.md](../commands/repo-pr-create.md)의 "제품 카탈로그 갱신"에 있다.

인덱스 항목은 디렉터리 링크와 한 문장 설명으로 구성한다. 디렉터리를 삭제하거나 이름을 바꿀 때도 세 인덱스를 함께 갱신한다. 세 인덱스와 디렉터리 목록이 어긋나면 [check_product_index.py](../../.github/scripts/checks/check_product_index.py)가 PR에서 실패시킨다.

`products.json`은 <https://products.akbun.com>m> 이 GitHub raw로 직접 읽는다. master에 들어가는 순간 사이트가 바뀌므로, 이 파일만은 배포를 기다리지 않는다. 반대로 빼먹으면 사이트가 그 자리에서 낡는다.

## 버전 올리기

release workflow를 실행시키는 파일을 고치면 같은 commit에서 버전을 올린다. 버그 수정은 patch, 기능 추가는 minor. 버전을 안 올리면 release가 tag 중복으로 실패하거나 같은 버전으로 다시 빌드되어, 고친 코드가 설치본에 전달되지 않는다.

[check_product_versions.py](../../.github/scripts/checks/check_product_versions.py)가 PR에서 이것을 검사한다. product마다 다른 버전 파일 위치와 tag 형식은 [product-versions.json](../../.github/scripts/checks/product-versions.json)에 있고, release workflow를 새로 만들면 이 파일에 등록한다. 등록하지 않은 workflow도 같은 검사가 잡는다.

검사가 못 잡는 것은 머지 후의 release 실패다. 그래서 두 가지를 지킨다.

1. 설치본에서 겪는 증상을 보고받으면 코드를 고치기 전에 배포된 버전부터 확인한다. `gh release list`와 설치본 `Info.plist`의 버전을 대조한다. master에 이미 고쳐져 있을 수 있다.
2. release workflow를 실행시킨 PR을 머지한 뒤 `gh run list --workflow=<release workflow>`로 master push의 결과를 확인한다. PR 초록불은 릴리스 성공이 아니다.

akbun-ai-useage와 akbun-awsviewer의 workflow는 최신 tag에서 다음 버전을 계산하므로 버전을 손으로 올리지 않는다. 다른 product의 release workflow를 손볼 일이 있으면 이 방식을 참고한다.

## product/README.md 형식

인덱스 테이블 형식:

```markdown
| 디렉터리 | 설명 |
|---|---|
| [akbun-gitdesktop](./akbun-gitdesktop/) | git graph를 보는 Electron 데스크톱 앱 |
```

## 검증 수단

사용자에게 확인을 떠넘기지 않는 것과 사용자의 화면을 뺏지 않는 것을 동시에 지켜야 하므로, 대상에 따라 수단을 정하고 순서를 둔다. 위 단계로 되는 검증을 아래 단계로 하지 않는다.

웹앱(`product/`의 페이지, 로컬 서버로 뜨는 화면)은 브라우저로 본다.

1. 데스크톱 앱(Claude Desktop, ChatGPT Desktop)의 내장 브라우저. 앱 안의 패널이라 화면과 마우스를 잡지 않는다. 페이지를 띄우고 DOM, console, network를 읽고 클릭과 입력까지 여기서 끝낸다.
2. 내장 브라우저가 없거나 그 페이지가 내장 브라우저에서 안 돌면 computer use로 외부 브라우저(Chrome 등)를 띄워 확인한다. 로그인 세션이 필요 없으면 새 창이나 게스트 프로필로 띄우고, 사용자의 로그인 세션은 그 세션이 반드시 필요할 때만 쓴다. 사용자의 화면을 쓰므로 무엇을 확인했는지 결과 보고에 한 줄 남긴다.
3. computer use가 없는 환경(클라우드 세션, CI)은 Playwright가 설치돼 있으면 [verify-page.mjs](../scripts/verify-page.mjs)로 페이지를 띄운다. 디렉터리나 URL을 받아 console 오류, 실패한 요청, 화면의 control 목록, 스크린샷을 남기므로 Playwright 코드를 매번 새로 쓰지 않는다. Playwright도 없으면 브라우저 검증을 건너뛰고 테스트 명령으로 내려간다.

product의 `wiki/features.md`는 기능 지도다. 화면 영역마다 이름과 selector를 적어 두어, 요청과 리뷰에서 같은 이름으로 같은 영역을 가리킨다. 있으면 화면을 건드리기 전에 읽고, 영역을 더하거나 이름을 바꾸면 같은 commit에서 고친다. 형식은 [akbun-reader의 지도](../../product/akbun-reader/wiki/features.md)를 따른다.

`product/`의 no-build-step 앱은 `workspace/src`를 정적 서버로 띄우면 브라우저에서 그대로 돈다. 화면 검증을 위해 Tauri나 Electron 번들을 빌드하지 않는다.

트레이 아이콘, 네이티브 메뉴, 창 동작처럼 화면 밖에 답이 없는 것은 computer use로 본다. 로컬 앱 번들은 이 경우에만 만든다.

computer use까지 왔으면 허락을 묻지 않고 진행한다.
