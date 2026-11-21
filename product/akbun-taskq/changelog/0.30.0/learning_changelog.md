# akbun-taskq 0.30.0 학습 노트

0.29.0에서 bot이 브라우저를 조종하게 됐지만, 클릭과 입력은 아무 확인 없이 실행됐다. 도구 설명에 "사겠다·보내겠다는 클릭 전에는 사용자에게 물어보라"고 적어 두었을 뿐이라 모델이 그 문장을 지키는지에 달려 있었다. 0.30.0은 그 약속을 코드의 게이트로 바꿨다.

## 어디에 게이트를 두었나

taskq에는 이미 bot 승인 장치가 있다. Bash의 `git push` 같은 명령은 `bot-gate.ts`가 막고 `bot_approvals`에 요청을 남기며, 사용자가 Must check에서 "Approve once"를 누르면 그 명령이 정확히 한 번 실행된다. 브라우저 도구는 taskq 자신의 team 도구라 이 gate를 거치지 않으므로, 같은 요청 표와 Must check를 쓰되 판단은 `tools-browser.ts`의 `gate()`에서 한다.

클릭 하나가 실행되기까지:

```mermaid
flowchart TD
    Call[browser_click / browser_type] --> Target[browserTarget: ref가 가리키는 요소의 이름, 태그, 종류, 페이지]
    Target --> Pw{비밀번호 칸에 입력?}
    Pw -->|예| Refuse[항상 거부]
    Pw -->|아니오| Site{허용한 사이트?}
    Site -->|아니오| SiteReq[browser_site 요청 → Must check<br/>Allow this site]
    SiteReq -->|승인| Allowed[(meta browser_sites:bot)]
    Site -->|예| Risky{되돌릴 수 없어 보이는 동작?}
    Risky -->|아니오| Run[실행]
    Risky -->|예| Once{승인된 같은 동작이 있나}
    Once -->|예, 소비| Run
    Once -->|아니오| ActReq[browser_action 요청 → Must check<br/>Approve once]
```

## 두 종류의 승인을 나눈 이유

Claude Desktop의 브라우저는 사이트마다 한 번 허락을 받는다. 클릭마다 묻는다면 사용자는 몇 번 만에 내용을 읽지 않고 승인부터 누르게 되고, 그러면 승인은 아무것도 막지 못한다. 그래서 평범한 클릭은 사이트 단위로 한 번만 묻고, 정말 되돌릴 수 없는 동작만 따로 한 번씩 묻는다.

- 사이트 승인은 "한 번 실행"이 아니라 "이 사이트를 허용"이다. 그래서 `decideApprovalRequest`가 `browser_site` 요청을 승인할 때 host를 허용 목록에 넣고 요청은 바로 `used`로 닫는다. bot에게 가는 메시지도 "이 명령을 한 번 실행해도 된다"가 아니라 "페이지를 다시 읽고 이어서 하라"로 바꿨다.
- 동작 승인은 ref가 아니라 "버튼 이름과 페이지 주소"로 동작을 부른다. ref(`e5`)는 페이지를 다시 읽을 때마다 바뀌기 때문에, 승인한 뒤 bot이 다시 읽어도 같은 동작으로 맞아야 한다.
- "되돌릴 수 없어 보이는가"는 버튼 이름과 링크를 영어·한국어 단어 목록(`IRREVERSIBLE_ACTION`)에 맞춰 본다. 명령어 ask-first 규칙과 마찬가지로 사고를 막는 장치이지 경계는 아니다. 버튼 이름은 무엇이든 될 수 있기 때문이다.
- 페이지를 열고 읽는 것과, 사용자가 오른쪽 창에서 직접 누르는 클릭은 막지 않는다. 사람이 하는 행동을 사람에게 다시 묻는 것은 의미가 없다.
