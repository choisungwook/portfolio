# 부록 C. 게이트웨이 요청 로그 추적

[2.3의 비교 스크립트](2.3-sse-vs-http.md#2-첫-텍스트와-완료-시간-측정) 출력에서 비스트리밍과 SSE의 Call ID를 확인합니다. 이전 출력이 없으면 스크립트를 한 번 실행합니다.

[LiteLLM Logs](http://localhost:4000/ui/logs/)에 접속해 사용자 이름 `admin`과 [실습용 마스터 키](../compose.yaml#L24)로 로그인합니다. **Logs → Request Logs**에서 최근 요청을 봅니다. 화면에 이전 결과만 있으면 로그가 저장될 시간을 잠시 기다린 뒤 **Refresh**를 누릅니다.

**Request Logs**의 검색창에 스크립트가 출력한 Call ID를 하나씩 붙여 넣고 Enter를 누릅니다. 한 건이 조회되면 테이블 오른쪽의 **Tags** 열을 확인합니다. 테이블의 **Request ID**에는 별도 식별자가 표시될 수 있으므로 검색에는 터미널의 Call ID를 사용합니다.

| 검색할 요청 | Tags에서 확인할 값 | 터미널에서 확인할 형식 |
| --- | --- | --- |
| Call ID (비스트리밍) | `sse-lab-non-stream` | `application/json` |
| Call ID (SSE) | `sse-lab-stream` | `text/event-stream` |

태그는 Python 비교 스크립트가 보냅니다. 2.3의 curl 요청에는 이 두 태그가 붙지 않습니다. 두 모드의 URL과 모델이 같을 때도 Call ID로 각각의 요청과 응답을 연결할 수 있습니다.

## 참고 문서

1. [LiteLLM Admin UI 로그](https://docs.litellm.ai/docs/proxy/ui_logs)
2. [LiteLLM Logs의 Tags 열](https://docs.litellm.ai/docs/tutorials/codex_customer_tracking)
