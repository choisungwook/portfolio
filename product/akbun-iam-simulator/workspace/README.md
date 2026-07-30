# akbun-iam-simulator workspace

AWS profile을 골라 aws 명령어를 실행해 보고, 그 profile(IAM role/user)에 해당 권한이 있는지 결과로 확인하는 데스크톱 앱이다. Electron + TypeScript로 만들었고 AWS SDK 대신 로컬에 설치된 aws CLI를 그대로 실행한다. CLI가 profile의 assume role, SSO, MFA 설정을 이미 처리해 주므로 앱이 자격증명을 직접 다루지 않기 위함이다.

## 기능

- 왼쪽 목록: ~/.aws/config와 ~/.aws/credentials에서 읽은 profile 목록. role_arn, sso_session, region을 함께 보여주고 클릭으로 고른다
- 가운데 위: 테스트할 aws 명령어를 입력하는 큰 텍스트 입력창. Cmd/Ctrl + Enter 또는 실행 버튼으로 실행한다
- 가운데 아래: 실행 결과. exit code(성공/실패), 걸린 시간, stdout, stderr를 나눠 보여준다
- 고른 profile은 AWS_PROFILE 환경변수로 넘긴다. 권한이 없으면 aws CLI의 AccessDenied가 stderr에 그대로 보인다
- aws로 시작하는 명령어만 실행한다. 다른 명령어는 실행 전에 거부한다

## 요구사항

- aws CLI가 설치되어 있어야 한다
- ~/.aws/config 또는 ~/.aws/credentials에 profile이 있어야 한다
- 명령어는 실제로 실행된다. 읽기 명령어(get, list, describe)로 권한을 확인하는 용도를 권장한다

## 개발 환경 실행

의존성을 설치하고 앱을 실행한다.

```bash
npm ci
npm run start
```

## 테스트

profile 파싱과 명령어 검증 로직을 node --test로 확인한다. 빌드가 함께 돈다.

```bash
npm test
```

## 패키징

electron-builder로 현재 OS용 설치 파일을 만든다. 결과물은 release 디렉터리에 생긴다.

```bash
npm run dist
```

## 릴리즈

master 브랜치에 이 디렉터리 변경이 머지되면 GitHub Actions(release-iam-simulator)가 package.json의 version을 읽어 akbun-iam-simulator-v<version> 태그와 릴리즈를 만든다. macOS Apple Silicon(arm64) dmg만 빌드한다. 새 릴리즈를 내려면 package.json의 version을 올리고 머지한다.

## 구조

- src/main: Electron main 프로세스. profile 파싱(profiles.ts), aws 명령어 실행(runner.ts), IPC 핸들러(main.ts)
- src/renderer: 화면. 왼쪽 profile 목록, 가운데 명령어 입력창과 실행 결과
