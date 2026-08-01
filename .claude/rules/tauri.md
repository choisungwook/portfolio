# Tauri 데스크톱 앱 규칙

`product/`에 데스크톱 앱을 만들 때의 기본 스택이다. 디렉터리와 인덱스 규칙은 [product.md](./product.md)를 따른다. Tauri로 만들 수 없는 경우에만 [electron.md](./electron.md)로 간다.

여기 적힌 것은 대부분 실제로 한 번 밟은 지뢰다. 문서를 읽어서 알게 된 것이 아니라 앱을 띄워 보고 알게 된 것이므로, 확인 없이 지우지 않는다.

## 디렉터리 구조

빌드 단계를 두지 않는다. 화면이 React를 요구할 만큼 복잡하지 않으면 plain HTML/CSS/JS를 그대로 서빙한다. 그러면 실행되는 소스가 저장소에 있는 소스와 같다.

```text
workspace/
  package.json          # version의 단일 출처. @tauri-apps/cli만 devDependency
  src/                  # 페이지. 번들러 없음
  src-tauri/
    Cargo.toml
    tauri.conf.json
    capabilities/default.json
    src/lib.rs          # 플러그인 등록, setup, invoke_handler
    src/commands.rs     # #[tauri::command] 모음
  test/                 # node --test. 앱 바이너리 없이 도는 것만 둔다
```

`npm create tauri-app@latest <name> -- --template vanilla --manager npm --yes`로 뼈대를 만들고 거기서 고친다. Cargo.toml의 `[lib] name`에 붙는 `_lib` 접미사와 `crate-type`은 Windows에서 필요하므로 지우지 않는다.

## 버전

버전은 `workspace/package.json`에만 둔다. tauri.conf.json은 값을 복사하지 않고 경로로 가리킨다.

```json
{
  "version": "../package.json"
}
```

Cargo.toml의 `version`은 번들러가 읽지 않는다. cargo가 요구해서 있을 뿐이므로 신경 쓰지 않는다.

## 무엇을 Rust에 두고 무엇을 페이지에 두는가

이 경계를 잘못 잡으면 나중에 전부 옮겨야 하므로 처음에 정한다.

- **Rust command**: 파일시스템을 건드리는 모든 것. 스캔, 이름 변경, 휴지통, 저장. 그리고 열기·탐색기에서 보기·클립보드처럼 임의 경로를 다루는 것.
- **페이지**: 파일 선택 다이얼로그, 확인 창, 컨텍스트 메뉴. 그리고 사용자 입력에 즉시 반응해야 하는 계산.

임의 경로를 다루는 플러그인 호출을 페이지에 두면 webview에 넓은 scope를 열어 줘야 한다. Rust에서 부르면 capability 검사 자체를 지나가므로 scope를 열 필요가 없다. capability는 IPC 경계를 지키는 것이지 Rust API 사용을 막는 것이 아니다.

반대로 blocking 네이티브 다이얼로그를 command 안에서 부르지 않는다. 스레드 문제가 생긴다. 페이지에서 경로를 받아 command에 넘긴다.

키 입력마다 백엔드에 묻지 않는다. 검색·필터처럼 즉시 반응해야 하는 것은 페이지가 자기 배열을 훑는다. 그 순수 로직은 별도 `.js`로 빼고 `<script>` 태그와 `require` 양쪽으로 로드해 node로 테스트한다.

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  globalThis.myAppLib = exported;
}
```

이때 그 파일의 최상위 이름들이 페이지의 전역이 되므로, 다른 스크립트에서 같은 이름으로 구조 분해하면 `Identifier has already been declared`로 죽는다. 하나의 이름 뒤에 두고 쓴다.

## 상태 갱신

변경을 일으키는 command는 전부 갱신된 전체 상태를 반환하게 한다. 페이지는 그것을 그대로 받아 다시 그린다. 부분 갱신을 페이지가 병합하기 시작하면 두 벌의 상태가 어긋나는 버그가 생긴다.

## asset protocol

로컬 파일을 `<img>`나 `<video>`에 띄우려면 네 가지가 모두 맞아야 한다. 하나라도 빠지면 에러 없이 깨진 이미지만 나온다.

1. Cargo feature에 `protocol-asset`을 넣는다. 없으면 `asset_protocol_scope()`가 아예 없다.
2. tauri.conf.json에서 `app.security.assetProtocol.enable`을 `true`로 둔다.
3. 경로를 `convertFileSrc()`로 바꿔서 쓴다. `file://`은 로드되지 않는다.
4. CSP에 `img-src`와 `media-src`를 **둘 다** 적는다. Tauri가 대신 넣어 주지 않는다.

`media-src`를 빠뜨리는 것이 가장 흔한 실수다. 공식 예제가 `img-src`만 보여 주는데, `<video>`와 `<audio>`는 `media-src`가 관장하므로 이미지만 나오고 동영상은 차단된다.

CSP는 플랫폼마다 URL이 달라서 둘 다 적는다. Windows는 `http://asset.localhost/...`, macOS와 Linux는 `asset://localhost/...`이다.

```json
{
  "csp": "default-src 'self'; img-src 'self' asset: http://asset.localhost https://asset.localhost data:; media-src 'self' asset: http://asset.localhost https://asset.localhost"
}
```

### scope는 설정이 아니라 런타임에서 연다

**설정의 `scope`에 `"**"`를 적어도 절대 경로에는 매치되지 않는다.** 사용자가 고른 폴더를 다루는 앱이라면 설정으로는 표현할 수 없다. 설정 scope는 `[]`로 두고 폴더가 추가될 때 Rust에서 연다.

```rust
app.asset_protocol_scope().allow_directory(path, true);
app.asset_protocol_scope().allow_file(path);
```

이 허용은 메모리에만 있다. 앱을 다시 켜면 사라지므로 `setup`에서 저장된 목록을 보고 다시 열어 준다. 안 하면 재시작 후 썸네일이 전부 깨진다. `tauri-plugin-persisted-scope`를 쓰는 방법도 있지만, 어차피 저장된 목록이 있으면 의존성 하나를 안 늘리는 쪽이 낫다.

디스크 전체나 홈 전체를 여는 것보다 추가된 폴더만 여는 쪽이 좁다. 이것이 설정보다 런타임이 나은 이유이기도 하다.

동영상 첫 프레임은 `preload="metadata"`와 `#t=0.5`로 얻는다. asset protocol이 Range 요청에 응답하고 `<video>`는 항상 Range를 보내므로 동작한다.

## 테마

[electron.md](./electron.md)의 CSS 규칙을 그대로 따른다. light를 기본으로 두고 `@media (prefers-color-scheme: dark)`로 덮는다.

Tauri에서 추가로 지킬 것은 하나다. 사용자가 "시스템 따름"을 골랐으면 창 테마를 **설정하지 않는다**. `None`으로 둬야 webview 안의 `prefers-color-scheme`이 OS를 계속 따라간다. 값을 박으면 그 순간부터 OS 변경을 무시한다.

```rust
let wanted = match theme {
    "light" => Some(tauri::Theme::Light),
    "dark" => Some(tauri::Theme::Dark),
    _ => None,
};
window.set_theme(wanted);
```

창에 `backgroundColor`를 지정해 기동 시 흰 화면 깜빡임을 막는다.

## capability

`capabilities/default.json`에 빠진 권한은 **컴파일이 아니라 런타임에** 실패한다. CI는 초록불이고 사용자 기계에서 깨진다. 그래서 목록은 짧게 유지하고, 페이지에서 실제로 부르는 플러그인 명령만 적는다.

파일시스템 작업을 Rust command로 옮기면 그만큼 이 목록이 짧아진다. 그것이 위의 경계를 그렇게 잡는 또 하나의 이유다.

## 디버깅

`setup`에서 debug 빌드일 때 devtools를 연다. 창이 앱의 전부이므로 대부분의 버그가 여기서 먼저 보인다.

```rust
#[cfg(debug_assertions)]
if let Some(window) = app.get_webview_window("main") {
    window.open_devtools();
}
```

## 업데이트

공식 updater 플러그인을 쓴다. 직접 만들지 않는다.

- `bundle.createUpdaterArtifacts`를 `true`로 둔다. 기본값이 `false`라 그냥 두면 `.sig`가 안 만들어지고, tauri-action이 latest.json 업로드를 **조용히** 건너뛴다. 릴리스는 멀쩡해 보이는데 아무도 업데이트를 못 받는다.
- `createUpdaterArtifacts: true`인데 `plugins.updater` 블록이 없으면 CLI가 에러로 죽는다. 둘은 같이 간다.
- `pubkey`에는 키 **내용**을 넣는다. 파일 경로가 아니다.
- endpoint는 HTTPS여야 한다. dev에서는 경고만 하고 릴리스 빌드에서 에러가 나므로, `tauri dev`에서 됐다고 안심하지 않는다.
- 서명 개인키는 `TAURI_SIGNING_PRIVATE_KEY` 환경변수로 넘긴다. `.env` 파일은 동작하지 않는다.
- **개인키를 잃어버리면 이미 설치된 사용자에게 영원히 업데이트를 못 보낸다.** 복구 경로가 없다. GitHub secret 말고 다른 곳에도 백업한다.
- Windows에서는 설치 파일을 띄운 뒤 플러그인이 앱을 스스로 종료한다. `downloadAndInstall()` 다음의 `relaunch()`는 Windows에서 실행되지 않는다.

## 릴리스 workflow

`tauri-apps/tauri-action`을 쓴다. 최신 stable major를 확인해서 적고 오래된 핀을 복사하지 않는다.

- tauri-action이 release를 만들고, **tag는 GitHub이 release를 만들면서 함께 만든다.** workflow에 `git tag` 단계를 두지 않는다.
- `releaseDraft`를 `true`로 두지 않는다. draft면 `releases/latest/download/latest.json`이 404라서 업데이트가 아무에게도 안 간다.
- NSIS만 빌드해도 `updaterJsonPreferNsis: true`를 적는다. 기본값이 msi 우선이다.
- Windows 설치 파일은 `installMode: "currentUser"`로 만든다. 관리자 권한이 필요 없고, 그래야 업데이트가 UAC 없이 조용히 돈다.
- `swatinem/rust-cache`로 `src-tauri`를 캐시한다. 안 하면 릴리스마다 의존성을 전부 다시 빌드한다.
- PR job은 테스트만 돌린다. 순수 로직 테스트는 webkit2gtk 같은 시스템 의존성이 없어도 ubuntu에서 돈다.

### 버전을 안 올리면 조용히 실패한다

[product.md](./product.md)에 적힌 함정이 Tauri에서는 더 조용해진다. electron-builder는 tag 생성에서 빨간불이라도 났지만, tauri-action은 기존 release를 찾아 그 위에 다시 올린다. 빌드도 초록불이고 릴리스도 멀쩡해 보이는데 내용만 예전 버전이다. 런타임에서도 `check()`가 그냥 `null`을 반환한다.

그래서 `workspace/`를 건드린 PR을 머지한 뒤에는 `gh release list`로 새 버전이 실제로 올라갔는지 눈으로 확인한다.

## 서명과 SmartScreen

코드 서명이 없으면 Windows SmartScreen이 첫 실행에서 경고한다. 릴리스 노트에 "추가 정보"를 누르고 "실행"을 선택하라는 안내를 넣는다. macOS의 `xattr -cr` 안내와 같은 자리다.
