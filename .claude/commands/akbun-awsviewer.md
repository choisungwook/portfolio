---
description: akbun-awsviewer를 만든다. 선택한 AWS profile로 AWS 리소스를 조회만 하는 macOS Tauri 데스크톱 앱
---

product/akbun-awsviewer를 만든다. 디렉터리 구성, wiki, adr, 인덱스 갱신, 작성 언어는 /repo-product-create를 따르고, 이 문서는 akbun-awsviewer의 요구사항을 고정한다.

## Stack

- macOS 데스크톱 앱이다. stack은 Rust Tauri로 고정하고 [.claude/rules/tauri.md](../rules/tauri.md)를 따른다.
- AWS 호출은 공식 AWS SDK for Rust(aws-config, aws-sdk-ec2 등)만 쓴다. aws CLI 실행이나 비공식 클라이언트를 쓰지 않는다.
- list, describe 등 조회 API만 호출한다. 생성·수정·삭제 API는 어떤 경우에도 넣지 않는다.
- API 호출은 항상 사용자가 선택한 profile의 자격으로 한다.

## 화면 구성

[akbun-k8supgradeview](../../product/akbun-k8supgradeview/workspace/src/renderer/index.html)의 레이아웃을 따른다.

- 왼쪽 고정 사이드바. 위는 브랜드, 아래는 아이콘 붙은 세로 메뉴다.
- 상단 바를 추가한다. 현재 선택된 AWS profile을 표시하고, 오른쪽 끝에 로그인 버튼을 둔다.
- 콘텐츠 영역은 툴바(필터, 새로고침)와 정렬 가능한 테이블로 구성한다.
- 행을 선택하면 표를 가리지 않도록 오른쪽에 붙는 detail 패널을 연다.
- 테마는 tauri.md의 규칙대로 light/dark를 모두 지원하고 시스템 설정을 따른다.

## 메뉴

### Instances

- EC2 인스턴스 목록을 테이블로 보여 준다.
- instance id와 Name tag로 필터한다. 필터는 페이지가 가진 배열 위에서 돌고, 키 입력마다 백엔드를 부르지 않는다.
- 인스턴스를 선택하면 AWS console처럼 Details, Network, Storage, Security 탭으로 상세를 조회한다.

### AWS Profile

- ~/.aws/config를 파싱해 profile 목록을 보여 주고 하나를 선택한다.
- 선택한 profile은 저장해 앱을 다시 열어도 유지한다.

### Settings

- 앱 전체 설정 메뉴다.
- SSL verify를 무시하는 옵션을 둔다. 기본값은 비활성화다.

## 인증

- ~/.aws/credentials의 access key는 쓰지 않는다. AWS IAM Identity Center(SSO) 로그인을 쓴다.
- 이미 로그인된 세션이 ~/.aws/sso/cache에 있으면 불러와 재사용한다.
- 로그인은 상단 바 오른쪽의 로그인 버튼에서 시작한다.
- SSO의 브라우저 인터랙티브 단계는 외부 브라우저로 보내지 않고 별도 데스크톱 다이얼로그(새 창)를 띄워 진행한다.
- 세션이 없거나 만료되면 API 에러를 그대로 보여 주지 않고 로그인 유도 메시지를 보여 준다.

## Release workflow

- verify/release 두 job 구성과 버전 계산은 [gitdesktop-release.yml](../../.github/workflows/gitdesktop-release.yml)을 따른다. 최신 tag에서 다음 버전을 계산하고, tag가 이미 있으면 초기에 실패시킨다.
- 빌드와 updater artifact(latest.json, .sig) 업로드는 tauri.md의 release 규칙을 따른다. self update가 도달해야 하므로 빼지 않는다.
- release note는 마지막 단계에서 akbun-gitdesktop처럼 작성한다. gh의 --generate-notes로 만들고, 서명 없는 macOS 빌드를 여는 xattr -cr 안내를 붙인다.

## 멈추는 지점

구현과 검증까지만 하고 commit, push, PR은 하지 않는다. 변경 요약을 보고하고 멈춘다.
