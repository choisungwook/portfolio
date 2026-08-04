# 라우팅 동작 관찰

EPP가 요청을 어디로 보내는지 눈으로 확인한다. [2-setup-kind-mac.md](./2-setup-kind-mac.md) 또는 [3-setup-gpu-node.md](./3-setup-gpu-node.md)로 환경을 먼저 만든다. 아래는 replica가 4개인 sim 환경 기준이고, GPU 환경은 replica가 2개라 같은 경향이 더 작은 숫자로 보인다.

## 준비

port-forward를 켜 둔다.

```bash
kubectl port-forward -n llm-d svc/quickstart-epp 8080:80
```

다른 터미널에서 공통 prefix와 요청 함수를 만든다. prefix를 길게 잡는 이유는 prefix-cache-scorer가 블록 단위로 해시하기 때문이다. 짧은 prompt는 블록이 하나뿐이라 차이가 안 난다.

```bash
PREFIX=$(yes "llm-d prefix cache routing handson document." | head -n 100 | tr '\n' ' ')

ask() {
  jq -nc --arg p "$2" --argjson m "$1" \
    '{model:"Qwen/Qwen3-0.6B", prompt:$p, max_tokens:$m}' \
  | curl -s http://localhost:8080/v1/completions \
      -H 'Content-Type: application/json' -d @- > /dev/null
}
```

어느 pod이 요청을 받았는지는 model server 로그로 센다. label로 로그를 모을 때 kubectl은 pod마다 마지막 10줄만 가져오므로 `--tail=-1`이 필요하다.

```bash
count_by_pod() {
  kubectl logs -n llm-d -l app.kubernetes.io/name=vllm-sim \
    --prefix --tail=-1 --since="$1" \
    | grep '/v1/completions' \
    | awk '{print $1}' | sort | uniq -c | sort -rn
}
```

## 실험 1 - 같은 prefix는 같은 pod으로 간다

같은 prefix에 꼬리만 바꾼 요청 10개를 순차로 보낸다.

```bash
for i in $(seq 1 10); do ask 10 "$PREFIX question $i"; done
count_by_pod 60s
```

- 첫 요청은 아무 pod에나 간다. 그 pod이 prefix를 처리했다는 사실을 EPP가 기억한다.
- 이후 요청은 대부분 그 pod으로 몰린다. prefix-cache-scorer의 weight가 3으로 가장 크기 때문이다.
- 완전히 한 pod에만 가지는 않는다. queue-scorer와 kv-cache-utilization-scorer가 반대 방향으로 밀기 때문이다. 가중합이라 항상 한 요소가 이기지 않는다.

## 실험 2 - prefix가 다르면 흩어진다

매번 다른 prefix로 10개를 보낸다.

```bash
for i in $(seq 1 10); do
  UNIQ=$(yes "unrelated topic $i padding sentence." | head -n 100 | tr '\n' ' ')
  ask 10 "$UNIQ question"
done
count_by_pod 60s
```

- pod 4개에 고르게 퍼진다. prefix hit이 없으므로 no-hit-lru-scorer가 가장 오래 안 쓴 pod을 고른다.
- 이 scorer가 없으면 hit이 없는 요청이 큐가 가장 짧은 pod 한 곳으로 쏠려 캐시가 한 pod에만 쌓인다.

## 실험 3 - 큐가 차면 prefix affinity를 포기한다

같은 prefix로 12개를 동시에 던진다. sim은 `--max-num-seqs 2`라 pod 하나가 동시에 2개만 처리한다.

```bash
for i in $(seq 1 12); do ask 200 "$PREFIX burst $i" & done
wait
count_by_pod 60s
```

- 실험 1과 달리 여러 pod으로 갈라진다. 캐시가 있는 pod의 큐가 길어지면서 queue-scorer 점수가 떨어졌기 때문이다.
- 이것이 prefix cache aware 라우팅과 sticky 라우팅의 차이다. sticky는 큐 길이와 무관하게 같은 곳으로 계속 보내서 그 pod만 막힌다.

## EPP가 남긴 판단 근거 보기

router values에서 EPP 로그 레벨을 `v: 2`로 켜 뒀다. 요청마다 후보 pod과 선택 결과가 남는다.

```bash
kubectl logs -n llm-d deploy/quickstart-epp -c epp --since=2m | tail -40
```

EPP가 pod 상태를 어떻게 보고 있는지는 메트릭으로 확인한다.

```bash
kubectl port-forward -n llm-d svc/quickstart-epp 9090:9090
curl -s http://localhost:9090/metrics | grep -i inference
```

- EPP는 각 pod의 `/metrics`를 주기적으로 긁어 큐 길이와 KV cache 사용률을 읽는다. sim이 vLLM의 메트릭 이름을 그대로 내보내기 때문에 sim 환경에서도 같은 경로로 동작한다.
- 반대로 말하면 model server가 vLLM 메트릭을 안 내보내면 queue-scorer와 kv-cache-utilization-scorer는 판단 근거가 없다.

## 정리하면서 남는 질문

- 여기서 쓴 prefix-cache-scorer는 EPP가 자기가 보낸 요청 이력으로 추정한 근사값이다. vLLM이 실제로 캐시를 evict하면 EPP는 모른다. 정확히 맞추려면 vLLM의 KV cache 이벤트를 받아야 하고 그것이 precise prefix cache routing 가이드다.
- scorer 가중치는 요청 길이 분포에 따라 달라진다. prompt가 짧고 생성이 긴 워크로드에서는 prefix affinity의 이득이 작아 weight를 낮추는 게 맞을 수 있다.
- replica가 1개면 이 문서의 실험은 전부 무의미하다. llm-d는 replica가 여러 개일 때부터 의미가 생긴다.
