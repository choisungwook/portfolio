# Codex 코딩 루프를 실행해요

처음부터 모든 테스트를 통과시키지 않아도 괜찮아요. 이 실습은 실패한 기준선에서 출발해, Codex가 받은 증거와 받지 못한 증거가 어떻게 다른지 확인하는 과정이에요.

[환경 준비](1-setup.md)를 마친 뒤 시작해요.

## 실습 구조를 확인해요

먼저 역할과 파일의 경계를 봐요.

| 역할 | 파일 | 수정 권한 |
| --- | --- | --- |
| 응시자 | `candidate/path_policy.py` | Codex가 수정 |
| 계약 | `task.md` | 수정 금지 |
| train 심판 | `cases/train.json`, `scripts/train_gate.py` | 수정 금지 |
| holdout 심판 | `cases/holdout.json`, `scripts/holdout_gate.py` | 수정 금지 |
| 라우터 | `scripts/run_loop.py` | 수정 금지 |

실습용 holdout 파일은 학습을 위해 저장소에 보여요. 실제 CI에서는 코딩 에이전트가 읽을 수 없는 별도 저장소나 실행 환경에 둬야 해요. 프롬프트의 "읽지 마세요"는 보안 경계가 아니거든요.

## 1. 심판 자체를 검증해요

후보 코드보다 먼저 심판의 단위 테스트를 실행해요.

```bash
make test
```

다음처럼 3개 테스트가 통과해야 해요.

```text
Ran 3 tests
OK
```

## 2. 실패하는 기준선을 만들어요

train 게이트를 실행해요. 종료 코드 `1`은 의도한 결과예요.

```bash
make train
```

초기 구현은 8개 중 6개를 통과해요. 실패 이유도 함께 나와요.

```text
TRAIN: 6/8 passed
- empty segment: path='src//app.py', expected=False, actual=True
- backslash: path='src\\app.py', expected=False, actual=True
```

holdout은 더 까다로워요. 점수만 보고 세부 이유는 코치에게 전달하지 않아요.

```bash
make holdout
```

초기 구현의 결과는 다음과 같아요.

```text
HOLDOUT: 2/8 passed
```

## 3. 한 번의 코딩 루프를 실행해요

이제 라우터가 최대 3회까지 Codex를 호출해요.

```bash
make loop
```

각 라운드는 같은 순서로 움직여요.

1. train 심판이 후보 코드를 실행해요.
2. 실패 이유를 `codex exec`에 전달해요.
3. Codex는 `candidate/path_policy.py`만 수정해요.
4. 보호 파일의 SHA-256 해시가 바뀌지 않았는지 확인해요.
5. train 통과 후에만 holdout을 실행해요.

모델 출력은 매번 같지 않아요. 계약을 일반화한 구현이면 `TRAIN: 8/8`, `HOLDOUT: 8/8`, `GATE: SHIP` 순서로 끝나요. 3회 안에 끝나지 않거나 holdout이 실패하면 자동화를 늘리지 말고 사례와 계약을 검토해요.

## 4. 변경된 코드만 검토해요

게이트가 통과해도 diff 검토는 남아 있어요.

```bash
git diff -- computer_science/ai/codex-eval-loop/candidate/path_policy.py
```

다음 질문으로 확인해요.

- `..` 문자열 전체를 막지 않고 `..` 경로 조각만 막았나요?
- 허용 문자 규칙이 함수에서 바로 읽히나요?
- 예상하지 않은 파일이 바뀌지 않았나요?
- 예외를 무조건 정상이나 실패로 바꾸는 지름길이 없나요?

## 5. 독립 게이트를 다시 실행해요

루프의 자체 보고를 믿지 않고 두 게이트를 직접 실행해요.

```bash
make train && make holdout
```

이 명령이 통과하고 diff도 계약과 맞을 때만 실습의 `SHIP`을 받아들여요.
