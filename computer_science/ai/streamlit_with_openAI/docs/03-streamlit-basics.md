# Streamlit 동작 방식과 단점

Streamlit이 어떻게 동작하는지를 본다. 이 프로젝트의 코드와 무관하게, Streamlit 자체의 아키텍처가 무엇이고 그 모양이 왜 그런 결과를 낳는지를 정리한다.

## 한 줄 모델

> **사용자 상호작용이 일어날 때마다 서버가 파이썬 스크립트를 위에서 아래로 다시 실행하고, 실행 중 발생한 UI 명령을 WebSocket으로 브라우저에 흘려보낸다.**

이 한 줄 안에 Streamlit의 거의 모든 행동이 들어 있다. 기억해 둘 단어는 **rerun**, **DeltaGenerator**, **ScriptRunner**, **AppSession**, **WebSocket**이다.

## 구성 요소

- **Tornado 기반 서버**가 정적 자산(React 번들)과 WebSocket endpoint를 서빙한다. `streamlit run app.py`가 이 서버를 띄운다.
- 브라우저가 페이지를 처음 열면 서버는 **AppSession** 객체를 하나 만든다. 이게 한 사용자 한 탭의 단위다. 같은 사용자가 새 탭을 열면 새 session이 생긴다.
- AppSession마다 **ScriptRunner**라는 별도 thread가 붙어 있다. 사용자의 파이썬 스크립트(`app.py`)를 실제로 실행하는 주체가 이 thread다.
- 스크립트가 실행되면서 만나는 `st.title`, `st.button`, `st.dataframe` 같은 호출은 **DeltaGenerator**를 통해 protobuf 메시지(ForwardMsg)로 변환되어 브라우저로 전송된다.
- 브라우저의 **React 프론트엔드**가 그 메시지를 받아 화면을 차분(差分) 갱신한다. 사용자가 위젯을 만지면 새 값을 다시 WebSocket으로 서버에 보낸다.

코드는 모두 한 파이썬 프로세스 안이고, AppSession은 그 프로세스가 메모리에 들고 있다. 별도의 메시지 큐, 별도의 워커 풀, 별도의 DB는 없다. **Streamlit 한 프로세스 = 모든 사용자의 상태**다.

## rerun 사이클

브라우저에서 위젯이 변경됐을 때 서버가 무슨 일을 하는지를 따라가본다.

1. 브라우저가 WebSocket으로 "버튼이 눌렸다 / selectbox가 X로 바뀌었다" 같은 **BackMsg**를 보낸다.
2. 서버의 AppSession이 이 메시지를 받아 위젯 상태를 갱신하고, 자기 ScriptRunner에 "다시 돌려라"고 지시한다.
3. ScriptRunner가 **현재 실행 중인 스크립트를 인터럽트**하고 (`StopException`을 다음 위젯 호출 시점에 던진다) 처음부터 다시 실행한다.
4. 새 실행 중 만나는 `st.button(...)`은 위젯 상태에서 직전 입력을 꺼내 자기 반환값에 채운다. 그래서 "버튼이 눌렸는가"가 평범한 if문으로 표현 가능하다.
5. 새 실행이 만든 ForwardMsg들이 브라우저에 흘러가고 React가 화면을 갱신한다.

**모든 파이썬 변수는 매 rerun마다 사라진다.** 모듈 전역도 마찬가지다. 위에서 아래로 다시 도는 셈이라 이전 실행의 지역 변수는 garbage가 된다.

## 상태가 살아남게 하는 두 가지 메커니즘

매번 처음부터 다시 도는 모델 위에서도 상태를 유지하려면 Streamlit이 제공하는 두 가지 슬롯에 넣어야 한다.

- **`st.session_state`** — 같은 AppSession 동안 살아남는 dict. 서버 메모리에 위치하므로 브라우저 새로고침이나 탭 종료 시 사라진다. 위젯 자체의 값(`key=...`로 등록한 위젯)도 내부적으로 같은 곳에 저장된다.
- **`@st.cache_data` / `@st.cache_resource`** — 함수 단위 캐시.
  - `cache_data`: 직렬화 가능한 결과(데이터프레임, 리스트, 문자열 등)를 인자 해시로 캐시한다.
  - `cache_resource`: DB 연결, ML 모델 핸들처럼 직렬화하지 않고 **모든 session이 공유**할 자원에 쓴다.

영구 저장(프로세스가 죽어도 살아남는 데이터)은 Streamlit이 책임지지 않는다. 외부 DB나 파일 시스템에 직접 써야 한다.

## 멀티유저 모델

- 모든 사용자가 **같은 파이썬 프로세스**를 공유한다. AppSession은 분리되지만 GIL과 메모리는 한 곳이다.
- 한 사용자의 ScriptRunner가 무거운 작업으로 GIL을 잡으면, 다른 사용자의 스크립트도 같은 인터프리터 위에서 thread switching을 기다린다.
- 인증·세션 분리·rate limit는 Streamlit이 직접 풀어주지 않는다. 보통 그 앞단에 reverse proxy / SSO / 별도 게이트웨이를 둔다.
- horizontal scale을 하려면 같은 streamlit 컨테이너를 여러 개 띄우고 sticky session을 쓴다. WebSocket 기반이라 round-robin은 잘못된 인스턴스로 BackMsg가 갈 수 있다.

## 자주 헷갈리는 지점

- "콜백이 아니라 rerun이다." `on_click` 같은 콜백 API가 있긴 하지만 본질은 rerun에 묻혀 동작한다. 버튼 처리는 콜백 없이 `if st.button(...)`로 충분하다.
- "위에서 아래로 도는 게 정말 매번이다." 코드의 일부만 다시 도는 것이 아니다. 무거운 import도 캐시에 넣지 않으면 매번 평가된다.
- "위젯의 식별자는 위치 기반이다." 같은 페이지에서 같은 라벨로 두 번 같은 위젯을 만들면 ID가 충돌해 에러가 난다. `key="..."` 인자가 그래서 중요하다.
- "session_state는 서버 메모리다." 브라우저의 localStorage 같은 곳이 아니다. 새로고침은 같은 session을 유지하지만, 프로세스가 재시작하면 session_state도 사라진다.

## 단점

이 모델 덕에 데이터/AI 데모를 빨리 만드는 데는 강하지만 한계가 분명하다.

- **rerun 비용** — 위젯 하나만 바꿔도 스크립트 전체가 다시 돈다. 비싼 import·DB 쿼리·외부 호출은 캐시에 넣지 않는 한 매번 다시 일어난다. 페이지가 무거워질수록 체감이 빨라진다.
- **세션 격리는 약하다** — 모든 사용자가 같은 파이썬 프로세스를 공유한다. 한 사용자의 무거운 작업이 다른 사용자의 응답성을 직접 깎는다.
- **인증·권한이 빠져 있다** — 사용자 식별, 역할 기반 접근, audit log 같은 기본 기능이 없다. 외부 인증 게이트웨이를 앞에 두는 것이 일반적이다.
- **레이아웃 자유도가 낮다** — 위에서 아래로 흘러가는 단순한 레이아웃이 기본이다. 픽셀 단위 디자인이나 복잡한 대시보드 그리드를 짜려면 다른 도구가 빠르다.
- **WebSocket 의존** — 사내 프록시·CDN·LB가 WebSocket을 깔끔하게 통과시키지 못하면 디버깅이 어렵다. iframe 임베드도 같은 이유로 까다롭다.
- **백엔드 API 서버는 아니다** — JSON을 반환하는 endpoint, webhook 수신, 외부 시스템 호출 같은 일은 Streamlit이 다룰 자리가 아니다.
- **상태 모델이 강제하는 사고방식** — `session_state`로 도망갈 수는 있지만, 본질적으로 "한 번 위에서 아래로 다시 돌리는" 모델이라 복잡한 상태 머신·라우팅·페이지 간 데이터 전달은 빨리 어색해진다.
- **버전 호환성에 민감** — 위젯 API와 캐시 API가 메이저/마이너 버전 사이에서 종종 바뀐다. 의존성을 잠그지 않으면 다시 띄울 때 깨질 수 있다.

요점: **사람이 한 번 써보고 가는 가벼운 데모에는 최적**, 그 외의 시나리오에서는 다른 도구를 의심해야 한다.

## 참고자료

- Streamlit 실행 모델: <https://docs.streamlit.io/develop/concepts/architecture/run-your-app>
- App model & rerun: <https://docs.streamlit.io/develop/concepts/architecture/architecture>
- `st.session_state`: <https://docs.streamlit.io/develop/concepts/architecture/session-state>
- 캐싱(`cache_data` / `cache_resource`): <https://docs.streamlit.io/develop/concepts/architecture/caching>
- Streamlit 서버 / WebSocket 동작: <https://docs.streamlit.io/develop/concepts/architecture/forward-message-cache>
