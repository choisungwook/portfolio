# ACP (Agent Client Protocol)

에디터와 코딩 agent 사이의 통신 규약이다. LSP가 에디터와 언어 서버를 떼어놓은 것과 같은 방식으로, 에디터 N개와 agent M개의 조합을 N×M이 아니라 N+M으로 만든다.

이 핸즈온은 모델을 부르지 않는다. 정해진 순서대로만 움직이는 agent와 그것을 구동하는 client를 표준 라이브러리만으로 직접 만들어, 선 위를 흐르는 JSON 한 줄 한 줄을 눈으로 본다. 스트리밍이 무엇으로 구현되어 있는지, 권한이 누구 손에 있는지가 이 실습의 관찰 대상이다.

## 어디부터 볼 것인가

학습지 [studysheet-acp-protocol.html](./studysheet-acp-protocol.html)이 본문이다. 브라우저로 열어 페이지를 넘기며 읽는다. 외부 라이브러리 없이 파일 하나로 동작한다.

| 순서 | 내용 | 자료 |
|---|---|---|
| 1 | 실행 환경 준비와 정리 | [docs/1-setup.md](./docs/1-setup.md) |
| 2 | 메시지 형태와 handshake, MCP와의 관계 | [docs/2-protocol.md](./docs/2-protocol.md) |
| 3 | 한 턴을 직접 흘려보며 관찰 | [docs/3-handson.md](./docs/3-handson.md) |
| 4 | 어디에 쓰이는가, 무엇을 조심하는가 | [docs/4-adoption-and-caveats.md](./docs/4-adoption-and-caveats.md) |

## 세 문장 요약

ACP는 에디터가 client, agent가 server인 JSON-RPC 2.0 규약이고 stdio 위에서만 안정화되어 있다. 스트리밍은 별도 채널이 아니라 agent가 client에게 보내는 `session/update` notification의 연속이며, 파일 읽기와 쓰기는 agent가 직접 하지 않고 client에게 요청해서 client가 대신 수행한다. 그래서 권한 판단은 전부 client 쪽에 있고, agent가 권한을 물어보는 것은 규약이 강제하는 의무가 아니라 agent의 선택이다.

## 디렉터리

| 경로 | 설명 |
|---|---|
| `src/acp.py` | stdio 위의 JSON-RPC 2.0 전송 계층. client와 agent가 공유한다 |
| `src/agent.py` | 정해진 한 턴만 수행하는 agent |
| `src/client.py` | agent를 subprocess로 띄우고 스트림을 그리는 client |
| `test_acp.py` | 허용·거부·capability 미제공 세 경로를 확인하는 자체 점검 |
