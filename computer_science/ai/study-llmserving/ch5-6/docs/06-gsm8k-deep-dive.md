# GSM8K 더 공부할 것

## 현재 핸즈온의 범위

- dataset: official GSM8K test split
- sample: 앞 20문항
- 목적: quantization 전후의 빠른 quality regression 탐지
- 제한: model ranking 또는 통계적 결론에 부족
- hard timeout: inference 180초
- timeout 처리: accuracy 대신 `N/A`

## GSM8K란

- 초등학교 수준의 multi-step 수학 word problem dataset
- 정답에 reasoning 과정과 최종 numeric answer 포함
- 최종 답 형식: `#### number`
- exact-match 평가: 마지막 numeric answer 비교

## 왜 smoke 20문항과 분리하는가

- smoke
  - arithmetic·common knowledge·DevOps 기본 질문 혼합
  - pipeline 장애와 심한 quality regression 빠른 확인
  - benchmark 표준성 낮음
- GSM8K
  - multi-step reasoning 중심
  - quantization이 reasoning output에 미치는 영향 확인 가능
  - prompt와 answer extraction에 민감

## 20문항 결과의 한계

- 한 문제의 비중: 5 percentage points
- sample ordering bias 존재
- 작은 model의 answer format 실패 가능
- 180초 timeout이 느린 model을 accuracy와 함께 벌점 처리할 위험
- 결과 용도: 빠른 gate만 적합

## full evaluation 전 고정할 항목

- dataset revision과 split
- prompt template
- chat template 적용 여부
- few-shot example
- temperature와 seed
- max output tokens
- answer extraction rule
- timeout과 retry rule
- concurrency
- model·runtime version

## 다음 실습

1. 전체 test split을 local file로 고정
2. model별 serial과 concurrency 4 결과 비교
3. answer extraction 실패와 reasoning 실패 분리
4. 95% confidence interval 계산
5. quantized model의 틀린 문제 교집합·차집합 분석
6. serving SLO와 accuracy를 함께 만족하는 Pareto frontier 작성

## 해석 질문

1. 20문항 accuracy 차이가 full set에서도 유지되는가?
2. 틀린 이유가 model reasoning인가 answer parser인가?
3. W4A16과 W8A8이 같은 문제를 틀리는가?
4. timeout을 accuracy 0점으로 볼 것인가 운영 실패로 분리할 것인가?
5. concurrency가 deterministic output에 영향을 주는가?

## 권장 결론

- GSM8K-20: 3분 quick gate
- full GSM8K: 별도 장시간 evaluation
- production 채택: domain dataset 추가 필수
- 속도 우위 단독 채택: 금지
