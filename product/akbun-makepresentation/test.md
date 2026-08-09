# 테스트

## 원칙

- 현재 worktree에서만 의존성 설치, 테스트, 빌드, 실행 검증을 수행한다.
- 로컬 검증 순서는 테스트 코드 실행, 빌드 확인, 빌드 산출물의 UI 시나리오 검증이다.
- `npm run dist`는 로컬 검증에 사용하지 않는다.
- Computer Use에 필요한 로컬 앱 번들만 생성한다.
- 배포, DMG 생성, updater 산출물 생성, 코드 서명, updater 서명을 수행하지 않는다.
- 이전 빌드, 설치된 앱, 다른 worktree의 산출물을 검증 근거로 사용하지 않는다.

## 1. 테스트 코드

`workspace`에서 의존성을 설치하고 JavaScript와 Rust 전체 테스트를 실행한다.

```bash
cd product/akbun-makepresentation/workspace
npm install
npm test
npm run test:rust
```

- 실패한 테스트가 있으면 원인을 수정한 뒤 전체 테스트를 다시 실행한다.
- 모든 테스트가 통과하기 전에는 다음 단계로 진행하지 않는다.

## 2. 빌드

DMG, updater 산출물, 서명 단계를 제외하고 현재 소스로 로컬 앱 번들을 빌드한다.

```bash
npm run tauri -- build --bundles app --no-sign --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

- 빌드가 성공해야 한다.
- 검증할 앱은 `workspace/src-tauri/target/release/bundle/macos/akbun-makepresentation.app`이다.

## 3. UI 시나리오

Computer Use로 방금 빌드한 `workspace/src-tauri/target/release/bundle/macos/akbun-makepresentation.app`을 직접 실행한다.

항상 다음 기본 시나리오를 검증한다.

1. 앱이 정상적으로 실행되고 편집기 화면이 표시된다.
2. 슬라이드를 추가하고 슬라이드 전환이 동작한다.
3. 텍스트와 도형을 추가하고 이동하거나 편집한다.
4. 실행 취소와 다시 실행이 동작한다.
5. 프레젠테이션 모드에 진입하고 종료한다.

- 변경 기능의 정상 시나리오와 주요 실패 시나리오를 추가로 검증한다.
- 파일 입출력 변경은 임시 파일로 저장, 다시 열기, 내보내기를 검증한다.
- 실행 중인 프로세스가 현재 worktree의 `workspace/src-tauri/target/release/bundle/macos/akbun-makepresentation.app/Contents/MacOS/akbun-makepresentation`인지 확인한다.
- 검증이 끝나면 이번 테스트에서 실행한 앱과 백그라운드 프로세스만 종료한다.

## 결과 보고

- 실행한 테스트 명령과 통과 여부를 기록한다.
- 빌드 명령과 빌드 산출물 경로를 기록한다.
- Computer Use로 검증한 시나리오와 결과를 기록한다.
- 검증하지 못한 항목이 있으면 원인과 재현 조건을 기록한다.
