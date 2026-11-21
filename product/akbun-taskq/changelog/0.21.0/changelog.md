# akbun-taskq 0.21.0

## Added

- macOS 데스크톱 앱. GitHub Release에 `taskq-desktop-darwin-arm64.dmg`(Apple silicon)가 함께 올라온다. 앱을 열면 안에 든 taskq 실행 파일이 시작되고 그 화면이 앱 창에 뜬다. 터미널에서 `taskq run`을 하고 주소를 브라우저에 붙여 넣는 과정이 없다. 창을 닫으면 taskq도 함께 끝난다. taskq는 로그인 셸을 거쳐 시작하므로 bot이 터미널과 같은 PATH로 `aws`, `git`, `codex`, `kiro-cli`를 찾는다. 설정 파일과 데이터 폴더는 명령줄 실행 파일과 같다. 앱 안의 taskq는 설정 > 업데이트로 올리고, 올린 뒤 앱을 다시 연다.
- 데스크톱 앱 창에서 새 창으로 여는 링크(PR, release notes, Kiro 로그인 주소)는 기본 브라우저로 열리고, 내려받는 파일은 `~/Downloads`에 저장된다.

## Changed

- 삭제 확인과 workflow 승인 메모를 브라우저의 `confirm`, `prompt` 대신 화면 안의 dialog로 묻는다. 브라우저가 아닌 창에서는 그 둘이 아무것도 보이지 않고 취소로 끝나기 때문이다. workflow 승인·거절에서 메모 창을 취소하면 이제 아무것도 보내지 않는다(전에는 빈 메모로 보냈다).

## SDK

변경 없음.
