# Electron 데스크톱 앱 규칙

`product/`에 Electron 또는 데스크톱 앱을 만들 때 따른다. 디렉터리와 인덱스 규칙은 [product.md](./product.md)를 따른다.

## 테마

dark mode와 light mode를 모두 지원하고, 기본값은 시스템 설정을 따른다.

- 색은 CSS 변수로만 선언하고 컴포넌트에 색을 하드코딩하지 않는다.
- light를 기본값으로 두고 `@media (prefers-color-scheme: dark)`로 dark를 덮는다. 이것만으로 시스템 모드 추종이 끝난다. 브라우저가 OS 변경을 자동 반영하므로 리스너를 직접 달지 않는다.
- 사용자가 테마를 직접 고르는 기능이 요구사항일 때만 토글을 만든다. 이때 `<html data-theme="light|dark">`로 미디어 쿼리를 덮고, 선택값은 `localStorage`에 저장한다. `data-theme`이 없으면 시스템 모드다.
- BrowserWindow에 `backgroundColor`를 지정해 기동 시 흰 화면 깜빡임을 막는다. 시스템 테마에 맞추려면 `nativeTheme.shouldUseDarkColors`로 값을 고른다.

CSS 변수와 미디어 쿼리로 두 테마를 선언하는 최소 형태:

```css
:root {
  --bg: #ffffff;
  --fg: #1a1a1a;
  --border: #e0e0e0;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1e1e1e;
    --fg: #e8e8e8;
    --border: #3a3a3a;
  }
}

body {
  background: var(--bg);
  color: var(--fg);
}
```

사용자 선택 토글이 필요할 때만 추가하는 덮어쓰기 규칙:

```css
:root[data-theme='light'] { --bg: #ffffff; --fg: #1a1a1a; --border: #e0e0e0; }
:root[data-theme='dark']  { --bg: #1e1e1e; --fg: #e8e8e8; --border: #3a3a3a; }
```

기동 깜빡임을 막는 BrowserWindow 설정:

```ts
new BrowserWindow({
  backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
})
```
