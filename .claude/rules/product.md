# Product 규칙

`product/`는 핸즈온이 아니라 완성형 도구와 제품을 모아 두는 디렉터리다.

## 인덱스 갱신

`product/` 아래에 새 디렉터리를 만들면 같은 commit에서 두 인덱스를 갱신한다.

1. `product/README.md`의 인덱스 테이블에 항목을 추가한다.
2. 루트 `README.md`의 "직접 만든 제품" 섹션 목록에 항목을 추가한다. 형식은 `- [설명](./product/<디렉터리>/) (작성날짜)`를 따른다.

인덱스 항목은 디렉터리 링크와 한 문장 설명으로 구성한다. 디렉터리를 삭제하거나 이름을 바꿀 때도 두 인덱스를 함께 갱신한다.

## 버전 올리기

`product/*/workspace/` 아래를 고치면 같은 commit에서 버전을 올린다. 버그 수정은 patch, 기능 추가는 minor.

- akbun-screenshot, akbun-k8supgradeview, akbun-gitdesktop, akbun-shadowing-player: `workspace/package.json`의 `version`
- akbun-mactaskbar: `workspace/VERSION`
- akbun-agent-analysiscode: `workspace/pyproject.toml`의 `version`

버전을 안 올리면 그 PR의 변경은 사용자에게 도달하지 않는다. release workflow가 두 job으로 갈라져 있기 때문이다.

- PR에서는 `verify` job만 돈다. 테스트만 보고 버전은 보지 않는다. 그래서 버전을 안 올려도 PR은 초록불이다.
- tag와 release는 머지 후 master push의 `release` job이 만든다. 버전이 그대로면 `Create tag` 단계에서 "tag already exists"로 실패한다.
- 이 실패는 PR 화면에 나타나지 않는다. 아무도 보지 않으면 코드는 master에 있는데 배포는 안 된 상태가 계속된다.

실제로 akbun-screenshot에서 `3f5f655e`와 `0eea2913`이 연속으로 이렇게 실패했다. 두 PR 모두 머지됐지만 태그는 `v0.1.0` 하나로 남았고, 사용자는 이미 고쳐진 버그와 이미 추가된 메뉴를 없다고 보고했다.

따라서 두 가지를 지킨다.

1. 설치본에서 겪는 증상을 보고받으면 코드를 고치기 전에 배포된 버전부터 확인한다. `gh release list`와 설치본 `Info.plist`의 버전을 대조한다. master에 이미 고쳐져 있을 수 있다.
2. `workspace/`를 건드린 PR을 머지한 뒤 `gh run list --workflow=<release workflow>`로 master push의 결과를 확인한다. PR 초록불은 릴리스 성공이 아니다.

akbun-gitdesktop의 workflow는 이 문제를 다르게 푼다. 최신 tag에서 다음 버전을 계산하고, tag가 이미 있으면 초기에 실패시키고, `npm version`으로 package.json에 적용한다. 다른 product의 release workflow를 손볼 일이 있으면 이 방식을 참고한다.

## product/README.md 형식

인덱스 테이블 형식:

```markdown
| 디렉터리 | 설명 |
|---|---|
| [akbun-gitdesktop](./akbun-gitdesktop/) | git graph를 보는 Electron 데스크톱 앱 |
```
