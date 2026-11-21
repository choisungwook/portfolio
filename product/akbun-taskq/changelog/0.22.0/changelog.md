# akbun-taskq 0.22.0

## Fixed

- Kiro의 AWS SSO 로그인이 시작되지 않던 문제. kiro-cli는 start URL과 region을 인자로 받아도 터미널에서 다시 묻고, 터미널이 없으면 끝난다. 이제 로그인을 터미널 아래에서 실행하고 두 질문에 Enter로 답한다. IAM Identity Center로 로그인하도록 `--license pro`도 넘긴다. 끝내지 않은 로그인은 15분 뒤 정리한다.
- Kiro 로그인 확인(`kiro-cli whoami`)의 대기를 10초에서 30초로 늘렸다. 저장된 토큰이 만료돼 있으면 whoami가 먼저 토큰을 새로 받는데 IAM Identity Center에서는 10초를 넘긴다. 시간 안에 답이 없으면 그 이유(30초 안에 답이 없었음)를 보여 주고, 이것만으로 bot을 끄지는 않는다.
- Kiro bot의 로그인이 풀렸는데 그 bot이 꺼지지 않고 같은 요청을 다시 보내던 경우. 만료된 토큰, 바뀐 계정의 토큰, 출력 기록 안의 오류도 로그인 실패로 읽는다. `AccessDenied`, `Unauthorized`, 401·403, `dispatch failure`처럼 뜻이 여럿인 오류는 `kiro-cli whoami`로 확인해 로그인이 풀린 때만 bot을 끈다.
- OpenAI on Bedrock bot이 AWS SSO 세션이 끝난 뒤에도 같은 요청을 다시 보내다 메시지를 따로 두던 문제. AWS 프로파일이 자격 증명을 주지 않으면 로그인 실패로 보고 그 bot을 끄며, `aws sso login --profile <이름>`을 안내한다. 다시 로그인하면 화면이 열려 있는 동안 1분 안에 bot이 저절로 켜지고, 설정 > 연결의 다시 확인으로 바로 켤 수도 있다. Bedrock이 401이나 403으로 답하면 10분 동안 보관하던 토큰을 버리고 프로파일에 다시 묻는다.

## Changed

- Kiro bot의 모델 메뉴가 `kiro-cli`가 알려 주는 모델 목록을 보여 준다(context 크기와 credit 배율 포함). 전에는 목록이 비어 있었다.
- Kiro의 사용 한도(월·일·주 한도)에 걸린 요청과 형식이 거부된 요청은 다시 보내지 않고 바로 따로 둔다. 다시 보내도 같은 답이 오기 때문이다.

## SDK

변경 없음. Kiro는 SDK가 아니라 `kiro-cli` 실행이며, 모델 목록에 `kiro-cli chat --list-models --format json --no-interactive`를 새로 쓴다.
