# GSM8K 20문항 점수만으로 quantization을 선택하면 안 되는 이유

20문항에서 한 문제 차이는 accuracy 5%p입니다. 숫자는 명확해 보이지만 model ranking을 뒤집기에는 sample이 너무 작습니다. **GSM8K-20은 최종 평가가 아니라 quantization이 큰 quality regression을 만들었는지 빠르게 확인하는 gate입니다.**

## 현재 실습이 답하는 범위

- dataset: official GSM8K test split
- sample: 앞 20문항
- 목적: BF16·W4A16·W8A8 사이의 큰 quality regression 탐지
- hard timeout: inference 180초
- timeout 처리: accuracy 대신 `N/A`
- 답하지 못하는 것: model ranking과 통계적으로 유의한 차이

GSM8K는 multi-step 수학 word problem dataset입니다. 정답에는 reasoning 과정과 `#### number` 형식의 최종 numeric answer가 포함됩니다. 이 실습은 마지막 숫자를 추출해 exact match로 비교합니다.

## Smoke test와 GSM8K는 실패를 다르게 찾습니다

Smoke 20문항은 arithmetic, common knowledge, DevOps 질문을 섞어 pipeline 장애와 심한 quality regression을 빠르게 찾습니다. 표준 benchmark는 아니지만 model endpoint, prompt, parser가 이어지는지 확인하기 좋습니다.

GSM8K는 multi-step reasoning에 집중합니다. Quantization 전후의 reasoning 결과를 비교할 수 있지만 prompt template과 answer extraction에 민감합니다.

| 평가 | 잘 찾는 문제 | 찾기 어려운 문제 |
| --- | --- | --- |
| Smoke 20 | pipeline 장애·심한 출력 품질 저하 | 표준화된 reasoning 차이 |
| GSM8K-20 | 빠른 reasoning regression | 작은 accuracy 차이·model ranking |
| Full GSM8K | 더 안정적인 reasoning 차이 | 실제 domain quality |

여기서 “두 model이 5%p 차이라면 더 높은 쪽을 고르면 되지 않나”라고 묻습니다. 한 문제의 비중이 바로 5%p이므로 parser 실패나 sample ordering 하나가 차이 전체를 만들 수 있습니다.

## 20문항 결과가 흔들리는 이유

- sample size
  - 한 문제의 비중이 5%p
  - confidence interval이 넓음
- ordering bias
  - test split 앞부분이 전체 난이도를 대표한다는 보장 없음
- answer format
  - reasoning은 맞아도 마지막 숫자 형식이 달라 parser가 실패할 수 있음
- timeout
  - 느린 inference를 reasoning 실패와 같은 0점으로 처리할 위험
- prompt
  - chat template·few-shot example·max token 차이가 결과에 영향

Accuracy와 운영 실패도 분리해야 합니다. 180초 timeout은 production 관점에서는 실패지만 model reasoning 능력의 오답과 같은 원인은 아닙니다.

## Full evaluation 전에 고정할 조건

비교 조건이 달라지면 quantization 효과가 아니라 benchmark 설정 차이를 측정하게 됩니다.

- dataset revision과 split
- prompt와 chat template
- few-shot example
- temperature와 seed
- max output tokens
- answer extraction rule
- timeout과 retry rule
- concurrency
- model과 runtime version

여기서 concurrency를 고정하는 이유는 처리량 비교만을 위한 것이 아닙니다. Scheduler와 timeout 조건이 달라지면 완료한 sample 집합까지 달라질 수 있기 때문입니다.

## 다음 평가에서 확인할 것

1. 전체 test split을 local file로 고정합니다.
2. model별 serial과 concurrency 4 결과를 비교합니다.
3. answer extraction 실패와 reasoning 실패를 분리합니다.
4. 95% confidence interval을 계산합니다.
5. quantized model이 틀린 문제의 교집합과 차집합을 분석합니다.
6. serving SLO와 accuracy를 함께 만족하는 Pareto frontier를 작성합니다.
7. 실제 production domain dataset을 별도 quality gate로 추가합니다.

## 선택 기준

- GSM8K-20: 빠른 regression gate
- Full GSM8K: 장시간 reasoning evaluation
- Domain dataset: production 채택 판단
- Timeout: accuracy와 분리한 운영 실패 지표
- 속도 우위만 있는 model: 채택 보류

## 정리

GSM8K 20문항의 숫자는 명확하지만 결론의 범위는 좁습니다. 5%p 차이는 한 문제일 수 있고, 그 한 문제는 reasoning이 아니라 parser나 timeout 문제일 수 있습니다. **GSM8K-20은 큰 이상을 찾는 경보로 사용하고, model 선택은 full evaluation과 domain quality gate에서 결정해야 합니다.**

## 참고자료

- [Training Verifiers to Solve Math Word Problems](https://arxiv.org/abs/2110.14168)
- [GSM8K dataset](https://huggingface.co/datasets/openai/gsm8k)
