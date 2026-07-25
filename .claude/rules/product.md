# Product 규칙

`product/`는 핸즈온이 아니라 완성형 도구와 제품을 모아 두는 디렉터리다.

## 인덱스 갱신

`product/` 아래에 새 디렉터리를 만들면 같은 commit에서 두 인덱스를 갱신한다.

1. `product/README.md`의 인덱스 테이블에 항목을 추가한다.
2. 루트 `README.md`의 "직접 만든 제품" 섹션 목록에 항목을 추가한다. 형식은 `- [설명](./product/<디렉터리>/) (작성날짜)`를 따른다.

인덱스 항목은 디렉터리 링크와 한 문장 설명으로 구성한다. 디렉터리를 삭제하거나 이름을 바꿀 때도 두 인덱스를 함께 갱신한다.

## product/README.md 형식

인덱스 테이블 형식:

```markdown
| 디렉터리 | 설명 |
|---|---|
| [akbun-gitdesktop](./akbun-gitdesktop/) | git graph를 보는 Electron 데스크톱 앱 |
```
