# 개발과 릴리즈

모든 명령은 `workspace/` 디렉터리에서 실행한다.

## 빌드와 실행

의존성 설치 후 앱을 실행한다. build는 tsc 두 번(main용, renderer용)과 정적 파일 복사(`scripts/copy-static.js`)로 구성되며 번들러는 쓰지 않는다.

```bash
npm ci
npm run start
```

## 테스트

build 후 node 내장 test runner로 테스트를 돌린다. 업데이트 기능의 디스크 누수 방지 지점 세 곳, karpenter 리소스 파싱의 빈 값 처리, cordon / uncordon이 실행하는 kubectl 인자를 검증하며, PR verify job에서도 실행된다.

```bash
npm test
```

## 패키징

현재 OS용 설치 파일을 만든다. 결과물은 `workspace/release/`에 생긴다.

```bash
npm run dist
```

## 릴리즈 절차

1. `workspace/package.json`의 version을 올린다. 버전은 별도 태그 관리 없이 package.json에서만 관리한다.
2. master에 머지하면 GitHub Actions `release-k8supgradeview`가 실행된다.
3. 워크플로우는 macOS 러너에서 arm64 dmg를 빌드하고, 빌드가 성공한 뒤에만 `akbun-k8supgradeview-v<version>` 태그를 만들고, 태그가 만들어진 뒤에만 릴리즈를 만든다.
4. PR에서는 verify job이 ubuntu에서 tsc 컴파일만 검증한다.

version을 올리지 않고 머지하면 같은 태그가 이미 있어 태그 생성 단계에서 실패한다. workspace 코드를 바꾸면 version을 함께 올린다.

## 작업 시 주의점

- tsconfig가 두 개다. main은 CommonJS(Node), renderer는 DOM lib을 쓴다. renderer 코드는 import/export 없이 작성해야 plain script로 로드된다.
- renderer 전역 타입 이름이 DOM 내장 타입과 겹치지 않게 한다. 실제로 NodeFilter라는 이름이 DOM 타입과 충돌해 NodeFilterKind로 바꾼 적이 있다.
- CSP가 `default-src 'self'`이므로 외부 리소스(CDN 등)는 로드할 수 없다.
- kubectl 응답 파싱 로직을 바꿀 때는 `--field-selector`, label 기준(architecture.md 참고)이 EKS 실클러스터에서 유효한지 확인한다.
