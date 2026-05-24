# Chapter 5 데이터셋

## 목적

- Chapter 5 MyElite fine-tuning 데이터셋을 K3s 전체 실습에서 파일시스템 입력으로 사용한다.

## 파일

| 파일 | 용도 | 원본 |
|---|---|---|
| `loyalty_qa_train.jsonl` | fine-tuning 학습 데이터 | `https://kubernetes-for-genai-models.s3.amazonaws.com/chapter5/loyalty_qa_train.jsonl` |
| `loyalty_qa_val.jsonl` | fine-tuning 검증 데이터 | `https://kubernetes-for-genai-models.s3.amazonaws.com/chapter5/loyalty_qa_val.jsonl` |

원본 파일 확장자는 `.jsonl`이지만 내용은 JSON 배열이다.

## 갱신

원본 파일을 다시 내려받는다.

```sh
curl -L https://kubernetes-for-genai-models.s3.amazonaws.com/chapter5/loyalty_qa_train.jsonl \
  -o data/chapter5/loyalty_qa_train.jsonl
curl -L https://kubernetes-for-genai-models.s3.amazonaws.com/chapter5/loyalty_qa_val.jsonl \
  -o data/chapter5/loyalty_qa_val.jsonl
```

JSON 문법을 확인한다.

```sh
python3 -m json.tool data/chapter5/loyalty_qa_train.jsonl >/tmp/loyalty_qa_train.json
python3 -m json.tool data/chapter5/loyalty_qa_val.jsonl >/tmp/loyalty_qa_val.json
```
