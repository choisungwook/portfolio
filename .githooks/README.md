# 커밋 개인정보 검사

저장소 루트에서 아래 명령을 한 번 실행하면 Claude Code, Codex, Antigravity, 일반 터미널의 `git commit`에 같은 검사가 적용된다. 이미 다른 `core.hooksPath`를 쓰고 있다면 그 훅 구성에 통합한다.

```bash
git config --local core.hooksPath .githooks
```

훅은 staged 파일 이름과 추가한 텍스트, 커밋 메시지에서 알려진 자격 증명 패턴과 현재 장비의 IP, 기본 IPv4 게이트웨이, 호스트 이름, 사용자 홈 경로를 로컬에서 검사한다. 자동으로 알 수 없는 주소나 조직 식별자는 이 저장소의 로컬 Git 설정에 등록할 수 있다. 아래 값은 자리 표시다.

```bash
git config --local --add portfolio.privateValue '<검사할 실제 값>'
```

텍스트에 나온 공개 장비명과 일반적인 예시 값은 그대로 사용한다. 이미지 안의 글자와 Git 외부에서 작성한 내용은 직접 확인한다. 기존 에이전트 게시 검사는 push 이력과 PR·Issue 본문을 검토한다.
