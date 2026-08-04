# Electron 데스크톱 앱 규칙

`product/`에 Electron 앱을 만들 때 따른다. 디렉터리와 인덱스 규칙은 [product.md](./product.md)를 따른다.

데스크톱 앱의 기본은 [tauri.md](./tauri.md)다. Electron은 macOS나 Linux 빌드가 지금 필요할 때, 트레이·메뉴바가 앱의 주 화면일 때, Rust 대체재가 없는 node 라이브러리에 의존할 때, 그리고 이미 Electron으로 되어 있는 제품을 고칠 때 고른다. 아래 테마 규칙의 CSS 부분은 Tauri에도 그대로 적용된다.

## 자동 업데이트는 기본 기능이다

`product/`의 Electron 앱은 자동 업데이트를 처음부터 넣는다. 새로 만들 때도, 업데이트가 없는 기존 앱을 고칠 때도 마찬가지다. 매번 다시 판단하지 않고 [akbun-k8supgradeview](../../product/akbun-k8supgradeview/workspace/src/main/update.ts)의 구현을 포팅한다. 배경은 [knowledge/decisions/2026-07-unsigned-desktop-app-self-update.md](../../knowledge/decisions/2026-07-unsigned-desktop-app-self-update.md)에 있다.

업데이트가 없으면 릴리스가 사용자에게 도달하지 않는다. 설치본을 손으로 다시 받는 사람은 없다. [product.md](./product.md)의 버전 규칙이 릴리스를 만드는 쪽이고, 이 규칙은 그 릴리스가 실제로 설치되는 쪽이다. 둘 중 하나가 빠지면 고친 코드는 master에만 남는다.

포팅할 때 다음 여섯 가지를 그대로 유지한다.

- GitHub Release API에서 `<제품명>-v` 접두사 tag를 찾고 `process.arch`에 맞는 dmg를 고른다. electron-builder는 arm64에만 접미사를 붙인다.
- 버전은 문자열이 아니라 숫자로 비교하고, 기준은 `app.getVersion()`이다.
- dmg를 임시 디렉터리로 스트리밍한 뒤 분리된 bash 스크립트를 띄우고 앱을 종료한다. 실행 중인 앱은 자기 자신을 덮어쓸 수 없다.
- 임시 디렉터리 정리 지점 세 곳(내려받기 실패, 스크립트의 trap, 앱 시작 시 청소)을 모두 남긴다. 하나라도 사라지면 실패하는 테스트를 구현과 함께 포팅한다.
- 설치 제안은 packaged 빌드의 macOS에서만 한다. 개발 모드는 교체 대상이 Electron.app이고, Windows와 Linux 빌드에는 받을 dmg가 없다. 두 경우는 릴리스 페이지를 여는 버튼만 보여 준다.
- 진입점은 앱 메뉴나 트레이 컨텍스트 메뉴의 "Check for Updates…"다.

Windows는 이 방식이 필요 없다. electron-updater가 `verifyUpdateCodeSignature`를 `false`로 두면 서명 없는 NSIS 빌드를 설치한다. macOS의 이유를 Windows로 옮기지 않는다.

업데이트 모듈은 electron을 import하지 않는다. 그래야 앱 바이너리 없이 테스트가 돌고, PR의 verify job이 ubuntu에서 `ELECTRON_SKIP_BINARY_DOWNLOAD`로 끝난다. electron이 필요한 부분(`app.getVersion()`, `app.quit()`, dialog)은 호출하는 쪽인 main에 둔다.

TypeScript 앱이면 빌드 산출물 대신 원본을 테스트한다. node가 타입만 벗겨 내고 `.ts`를 그대로 읽으므로 테스트 전에 빌드할 필요가 없다.

```js
const { cleanupTempDirs, SWAP_SCRIPT } = await import('../src/main/update.ts')
```

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
