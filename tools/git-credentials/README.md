# Git Credentials

git이 HTTPS remote에 접근할 때 자격증명을 어떻게 얻고, 어디에 저장하고, 언제 버리는지를 정리한 핸즈온이다. GitHub에서 clone할 때마다 토큰을 다시 입력하다가, credential helper가 중간에서 무엇을 하는지 궁금해져서 파기 시작했다. 결론부터 말하면 git 자체는 자격증명을 저장하지 않는다. 저장은 전부 helper라는 외부 프로그램에 위임하고, git은 표준 입출력으로 helper와 대화만 한다.

이 구조를 이해하면 "왜 어떤 PC는 비밀번호를 안 물어보는가", "CI에서 토큰을 어떻게 안전하게 주입하는가", "계정 두 개를 어떻게 나눠 쓰는가"가 전부 하나의 원리로 설명된다.

> 주의: 이 문서의 모든 토큰 값은 `ghp_EXAMPLE...` 형태의 가짜 값이다. 실습 결과를 어딘가에 공유할 때 실제 토큰, `~/.git-credentials` 내용, `git credential fill` 출력이 그대로 드러나지 않도록 주의한다. 이 값들은 전부 비밀번호와 동급이다.

<!--
실행필요: akbun draw whale poster

한 장짜리 포스터 프롬프트:
"Git Credential 동작 원리 한 장 요약" 포스터를 그린다. 가운데에 git 명령(clone/fetch/push)이 있고,
아래로 credential helper 체인이 순서대로 연결된다. 왼쪽 상단에 credential context(protocol, host, path, username)
박스, 오른쪽에 helper 4종 비교(cache=메모리·TTL, store=평문 파일, OS keychain=암호화 저장소, GCM=OAuth 단기 토큰)를
저장 위치·수명·보안 수준 3축으로 비교하는 미니 테이블. 하단에 fill → (성공 시) approve / (실패 시) reject
상태 흐름도를 화살표로 표현한다. akbun whale 캐릭터가 열쇠를 물고 있는 일러스트, 단색 배경, 한국어 라벨.
-->

## git은 자격증명을 모른다

HTTPS로 push하면 서버가 401을 돌려주고, git은 그제서야 자격증명이 필요하다는 것을 안다. 이때 git이 하는 일은 세 단계다.

1. **fill**: 설정된 helper들에게 순서대로 "이 host의 자격증명 있는가"라고 묻는다. 아무도 답하지 못하면 터미널에서 직접 물어본다.
2. **approve**: 서버 인증에 성공하면 그 자격증명을 helper들에게 "이거 유효하다, 저장해라"라고 알린다.
3. **reject**: 인증에 실패하면 "이거 틀렸다, 지워라"라고 알린다.

helper와의 대화는 `key=value` 형태의 표준 입출력이다. 이 대화의 단위를 credential context라고 부르며 `protocol`, `host`, `path`, `username`으로 구성된다. 기본값으로 git은 `path`를 무시하고 `protocol + host` 단위로 자격증명을 매칭한다. 이 기본값이 나중에 멀티 계정 문제의 원인이 된다.

## Helper 종류와 트레이드오프

helper는 편의(입력 생략)와 보안(저장 방식·수명) 사이의 선택이다. 절대적인 정답은 없고 머신의 성격에 따라 달라진다.

| helper | 저장 위치 | 수명 | 트레이드오프 |
|---|---|---|---|
| `cache` | 메모리(unix socket 데몬) | 기본 900초 | 디스크에 안 남지만 재부팅·타임아웃마다 재입력. GUI keychain이 없는 리눅스 서버에서 무난한 기본값 |
| `store` | `~/.git-credentials` 평문 파일 | 영구 | 가장 편하고 가장 위험. 파일 읽기 권한 = 계정 탈취. 백업·dotfiles 동기화에 쓸려 들어가는 사고가 잦다 |
| `osxkeychain` / `wincred` / `libsecret` | OS 암호화 저장소 | 영구 | 암호화 + 로그인 세션 연동으로 개인 PC의 균형점. 단, OS 종속이라 헤드리스 서버에서는 못 쓴다 |
| Git Credential Manager(GCM) | OS 저장소 + OAuth | 단기 토큰 자동 갱신 | 장기 토큰 자체를 없애는 접근. 브라우저 인증이 필요해서 자동화 환경과는 궁합이 나쁘다 |
| custom helper | 직접 결정 | 직접 결정 | 시크릿 매니저·환경변수 등 어디서든 가져올 수 있다. 대신 안전성을 스스로 책임진다 |

한 가지 더. helper는 체인으로 여러 개 등록할 수 있다. fill은 위에서부터 물어보고 처음 답한 값을 쓰며, approve/reject는 모든 helper에게 전파된다.

## 활용 사례

- **개인 PC**: OS keychain 계열 또는 GCM. 장기 토큰을 평문으로 두지 않는 것이 목적이다.
- **CI/CD**: 저장하지 않는 것이 원칙이다. 환경변수로 주입된 단기 토큰을 custom helper가 읽어서 fill에만 응답하고, approve는 무시하게 만든다. GitHub Actions의 checkout 액션도 이 방식(일회성 helper 설정)으로 동작한다.
- **헤드리스 서버 자동화**: 갱신이 어려운 환경이면 `store` + 파일 권한 600으로 타협하거나, deploy key(SSH)로 아예 HTTPS를 벗어나는 선택지도 있다.
- **멀티 계정**: 같은 host에 계정이 두 개면 기본 매칭 단위(host)가 충돌한다. `credential.useHttpPath`로 매칭 단위를 repo 경로까지 확장해서 푼다.

## 핸즈온

외부 서비스 없이 로컬에서 전 과정을 재현한다. git의 credential 플럼빙 명령(`git credential fill/approve/reject`)을 직접 호출하면 서버 401 없이도 helper와의 대화를 관찰할 수 있다.

실습용 격리 환경을 만든다. 전역 gitconfig를 건드리지 않도록 HOME을 분리한다.

```bash
export LAB=$(mktemp -d)
export HOME_BACKUP=$HOME
export HOME=$LAB
git config --global user.name lab
git config --global user.email lab@example.com
```

### 1. helper 없이 대화 관찰하기

helper가 없으면 fill은 터미널 프롬프트로 넘어간다. context를 stdin으로 넣고 아무 값이나 입력해 본다.

```bash
printf 'protocol=https\nhost=github.com\n' | git credential fill
```

출력에 입력한 username/password가 `key=value`로 돌아온다. git 내부에서 오가는 데이터가 이 형태 그대로라는 것을 확인하는 단계다.

### 2. cache helper: 메모리에 잠깐

cache helper를 60초 타임아웃으로 설정하고, approve로 자격증명을 손으로 밀어 넣는다.

```bash
git config --global credential.helper 'cache --timeout=60'
printf 'protocol=https\nhost=github.com\nusername=demo\npassword=ghp_EXAMPLE1234\n' | git credential approve
```

이제 fill이 프롬프트 없이 즉시 답하는 것을 확인한다.

```bash
printf 'protocol=https\nhost=github.com\n' | git credential fill
```

디스크에는 아무것도 없고 소켓만 있다는 것을 확인한다. 60초 후 다시 fill하면 프롬프트로 돌아간다.

```bash
ls ~/.cache/git/credential/
```

### 3. store helper: 평문의 실체

helper를 store로 바꾸고 같은 자격증명을 approve한 뒤, 파일을 직접 열어본다.

```bash
git config --global credential.helper store
printf 'protocol=https\nhost=github.com\nusername=demo\npassword=ghp_EXAMPLE1234\n' | git credential approve
cat ~/.git-credentials
```

`https://demo:ghp_EXAMPLE1234@github.com` — URL에 비밀번호가 박힌 한 줄이 전부다. 암호화도 인코딩도 없다.

> 주의: 실제 계정으로 store를 쓰고 있다면 지금 `cat ~/.git-credentials`의 출력은 화면 공유·블로그 캡처에 절대 노출되면 안 된다. 이 파일이 dotfiles 저장소나 백업에 포함되는지도 함께 점검한다.

reject가 저장소를 실제로 지우는 것도 확인한다.

```bash
printf 'protocol=https\nhost=github.com\nusername=demo\npassword=ghp_EXAMPLE1234\n' | git credential reject
cat ~/.git-credentials
```

### 4. custom helper: 환경변수에서 읽기

CI 패턴을 그대로 재현한다. `get`(fill) 요청에만 환경변수 값을 답하고, `store`(approve)/`erase`(reject)는 무시하는 helper를 만든다.

```bash
cat > $LAB/env-helper.sh <<'EOF'
#!/bin/sh
if [ "$1" = "get" ]; then
  echo "username=ci-bot"
  echo "password=$GIT_TOKEN"
fi
EOF
chmod +x $LAB/env-helper.sh
git config --global credential.helper "$LAB/env-helper.sh"
```

토큰을 환경변수로 주고 fill이 그 값을 돌려주는지 확인한다.

```bash
GIT_TOKEN=ghp_EXAMPLE_FROM_ENV printf 'protocol=https\nhost=github.com\n' | git credential fill
```

approve를 무시하므로 디스크에는 아무 흔적도 남지 않는다. 파이프라인이 끝나면 토큰도 함께 사라진다는 것이 이 패턴의 핵심이다.

### 5. useHttpPath: 멀티 계정 분리

기본 매칭이 host 단위라는 것을 먼저 확인한다. store helper로 돌아가서 org-a 경로로 approve한 뒤, org-b 경로로 fill해 본다.

```bash
git config --global credential.helper store
printf 'protocol=https\nhost=github.com\npath=org-a/repo.git\nusername=user-a\npassword=ghp_EXAMPLE_A\n' | git credential approve
printf 'protocol=https\nhost=github.com\npath=org-b/repo.git\n' | git credential fill
```

org-b를 물었는데 user-a가 돌아온다. path가 무시되기 때문이다. 이제 매칭 단위를 경로까지 확장한다.

```bash
git config --global credential.useHttpPath true
printf 'protocol=https\nhost=github.com\npath=org-b/repo.git\n' | git credential fill
```

이번에는 저장된 것이 없다고 판단하고 프롬프트로 넘어간다. 계정별로 approve하면 경로 단위로 분리 저장된다. 대신 repo마다 자격증명을 한 번씩 저장해야 하므로, 계정이 하나뿐인 환경에서는 켤 이유가 없다.

### 정리

실습 환경을 원래대로 되돌린다.

```bash
export HOME=$HOME_BACKUP
rm -rf $LAB
```

## 배운 것

- git은 저장을 helper에 위임하고 fill/approve/reject 프로토콜로만 대화한다. helper를 이해하면 인증 문제 대부분은 "지금 어느 helper가 무엇을 답하고 있는가"로 좁혀진다.
- store의 편리함은 평문 파일이라는 비용 위에 있다. 개인 PC라면 OS keychain, 자동화라면 저장하지 않는 custom helper가 각자의 균형점이다.
- 문제가 생기면 서버에 요청을 날리기 전에 `git credential fill`로 로컬에서 먼저 재현하는 것이 가장 빠르다.
