# Chapter 5 공통 원리

## 목적

- K3s 전체 실습과 EKS 전체 실습에서 공통으로 관찰할 구조를 정리한다.

<!-- akbun-writing: 왜 로컬 K3s와 EKS를 같이 실습하는지 배경 추가 -->

## 핵심 흐름

1. JupyterHub에서 notebook으로 실험한다.
2. 같은 학습 흐름을 Kubernetes Job으로 옮긴다.
3. Job이 만든 모델 아티팩트를 inference API가 읽는다.
4. Chatbot UI가 RAG API와 inference API를 선택해서 호출한다.

## RAG와 fine-tuning

| 경로 | 데이터 | 방식 | 관찰점 |
|---|---|---|---|
| Shopping assistant | MyRetail catalog | Qdrant 검색 + LLM 답변 | 검색 품질이 답변 품질에 직접 영향을 준다 |
| Loyalty Program assistant | MyElite FAQ | LoRA fine-tuning + inference | adapter가 답변 패턴과 도메인 규칙을 반영한다 |

## Chatbot UI 테스트 스크립트

통과 기준은 완전한 문장 일치가 아니다.
응답에 핵심 값이 포함되는지 확인한다.

### Shopping assistant

| 번호 | 질문 | 통과 기준 |
|---|---|---|
| 1 | What is the price of Coolers Men Black Solid Sandals? | `Coolers`, `699 INR`, `black`, `sandals`를 포함한다. |
| 2 | Tell me about Karmic Vision Women Navy Blue Solid Top. | `Karmic Vision`, `549 INR`, `navy blue`, `top`을 포함한다. |
| 3 | What are Rubans Gold-Toned & Pink Dome Shaped Hand Painted Jhumkas? | `Rubans`, `315 INR`, `jhumkas` 또는 `earrings`, `pink`를 포함한다. |
| 4 | What is the price of Chkokko Men White Solid Round Neck T-shirt? | `Chkokko`, `464 INR`, `white`, `round neck T-shirt`를 포함한다. |
| 5 | Tell me about U.S. Polo Assn. Kids Girls Red Solid Hooded Sweatshirt. | `U.S. Polo Assn. Kids`, `949 INR`, `red`, `hooded sweatshirt`를 포함한다. |
| 6 | What is Wish Karo Girls Pink & Black Printed Fit and Flare Dress? | `Wish Karo`, `849 INR`, `pink`, `black`, `fit and flare dress`를 포함한다. |
| 7 | Tell me about Ecko Unltd Men Olive Green Slim Fit Camouflage Printed Casual Shirt. | `Ecko Unltd`, `699 INR`, `olive green`, `camouflage`, `casual shirt`를 포함한다. |
| 8 | What is EK DO DHAI Off-White & Black Hand-Painted Rectangle Serving Tray? | `EK DO DHAI`, `700 INR`, `serving tray`, `wood` 또는 `off-white and black`을 포함한다. |
| 9 | What is the price of HIGHLANDER Men Black & White Striped Polo Collar T-shirt? | `HIGHLANDER`, `699 INR`, `black and white`, `polo collar T-shirt`를 포함한다. |
| 10 | Tell me about Carrera Men Olive Green Sneakers. | `Carrera`, `4699 INR`, `olive green`, `sneakers`를 포함한다. |

### Loyalty Program assistant

| 번호 | 질문 | 통과 기준 |
|---|---|---|
| 1 | What is the cost of the MyElite Loyalty Program? | `99 USD`, `per year`, `non-refundable`를 포함한다. |
| 2 | Can I cancel my MyElite Loyalty Program membership? | `cancel at any time`, `benefits until the end`를 포함한다. |
| 3 | What benefits do I get with the MyElite Loyalty Program? | `2 years`, `2 accidental replacements`, `2% cashback`, `free expedited shipping`을 포함한다. |
| 4 | How many accidental replacements are allowed per year? | `2`, `per year`, `per product`, `30%`를 포함한다. |
| 5 | Is the MyElite Loyalty Program available in all states? | `48 contiguous states`, `New York`, `North Carolina`, `Pennsylvania`를 포함한다. |
| 6 | What is the maximum cashback I can earn? | `2%`, `1000 USD`, `per year`, `gift card`를 포함한다. |
| 7 | When do members get access to sales events? | `Black Friday`, `Labor Day`, `Cyber Monday`, `Christmas`를 포함한다. |
| 8 | If I cancel my membership, do I get a refund? | `no refund` 또는 `non-refundable`, `benefits until the end`를 포함한다. |
| 9 | Can I get loss coverage in California? | `No`, `New York`, `North Carolina`, `Pennsylvania`를 포함한다. |
| 10 | Does the MyElite Loyalty Program offer any discount on purchases? | `does not directly offer discounts`, `2% cashback`, `gift card`를 포함한다. |

## K3s와 EKS 차이

| 항목 | K3s 전체 실습 | EKS 전체 실습 |
|---|---|---|
| Cluster | Ubuntu host의 K3s single-node | AWS EKS |
| GPU | host NVIDIA GPU를 K3s containerd가 직접 사용 | EKS GPU managed node group |
| 데이터셋 | hostPath-backed PVC | S3 |
| 모델 아티팩트 | PVC | S3 |
| Identity | AWS 인증 없음 | Pod Identity |
| LoadBalancer | Traefik Ingress / port-forward | AWS Load Balancer |

## K3s single-node 운영 기준

K3s server node는 control-plane 역할과 workload node 역할을 함께 수행할 수 있다. 이 실습에서는 Ubuntu GPU host 1대를 Kubernetes node로 보고, GPU를 쓰는 Pod를 순서대로 실행한다.

장점:

- host NVIDIA driver와 K3s containerd 사이의 거리가 짧다.
- GPU Job, JupyterHub, inference API를 같은 로컬 서버에서 확인할 수 있다.

단점:

- GPU가 1개이면 JupyterHub user Pod와 fine-tuning Job, inference API를 동시에 실행하기 어렵다.
- EKS처럼 node group, cloud identity, managed load balancer를 실습하지는 않는다.

## 참고자료

- K3s architecture: https://docs.k3s.io/architecture
- Kubernetes GPU scheduling: https://kubernetes.io/docs/tasks/manage-gpus/scheduling-gpus/
- NVIDIA k8s-device-plugin: https://github.com/NVIDIA/k8s-device-plugin
- JupyterHub Helm chart: https://z2jh.jupyter.org/
