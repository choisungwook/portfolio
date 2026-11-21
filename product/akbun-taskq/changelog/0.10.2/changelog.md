# akbun-taskq 0.10.2

bot 생성 창이 아무것도 만들지 않던 문제를 고치고, 생성 때 받는 정보를 줄인다.

## Fixed

- bot 생성 창에서 저장 버튼(Save, 이제 생성 때는 Create)을 눌러도 bot이 생기지 않고 오류도 없던 문제. 폼에 `name="sdk"` 필드가 둘(Agent SDK 선택과 Limits의 읽기 전용 표시)이라 `form.elements.sdk`가 목록이 되어 창 초기화가 실패했고, 저장 핸들러가 붙지 않아 `method="dialog"` 폼이 창만 닫았다. 기존 bot 설정의 Save도 같은 이유로 저장되지 않았다. 읽기 전용 표시를 지웠고, 폼 하나에 같은 이름의 필드가 둘이면 실패하는 테스트(`test/ui-forms.test.ts`)를 더했다.

## Changed

- bot 생성은 이름, Agent SDK(OpenAI면 로그인 방식도), 설명만 받는다. "Start from" 프리셋 선택을 화면에서 뺐다. 역할, 지시문, 모델, 권한, skill, 한도는 기본값으로 시작하고 만든 뒤 bot의 설정(톱니바퀴)에서 바꾼다. CLI `taskq bots new --preset`과 API `preset`은 그대로다.

## SDK

SDK 사용 변경 없음.
