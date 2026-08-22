COMPOSE := docker compose
MODEL_LABEL ?= bf16

.PHONY: setup build gpu-check observability-up ch5-calculate ch5-oom ch5-load \
	vllm-bf16 vllm-gptq vllm-fp8 \
	quant-benchmark accuracy smoke gsm8k prefix-test summary down clean test lint format

setup:
	uv sync --group dev --group client

build:
	$(COMPOSE) --profile tools build benchmark

gpu-check:
	docker run --rm --gpus all nvidia/cuda:12.9.1-base-ubuntu24.04 nvidia-smi

observability-up:
	$(COMPOSE) --profile observability up -d prometheus grafana dcgm-exporter

ch5-calculate:
	uv run python -m calculators.memory_budget
	uv run python -m calculators.roofline

ch5-oom: build
	$(COMPOSE) --profile tools run --rm model-loader python -m model_loader.load_7b_expect_oom

ch5-load: build
	$(COMPOSE) --profile tools run --rm model-loader python -m model_loader.load_3b

vllm-bf16: build
	$(COMPOSE) --profile bf16 up -d vllm-bf16

vllm-gptq: build
	$(COMPOSE) --profile gptq up -d vllm-gptq

vllm-fp8: build
	$(COMPOSE) --profile fp8 up -d vllm-fp8

quant-benchmark: build observability-up
	bash scripts/run_quant_matrix.sh

accuracy: build
	bash scripts/run_accuracy_matrix.sh

smoke:
	$(COMPOSE) --profile tools run --rm -e MODEL_LABEL=$(MODEL_LABEL) benchmark python -m benchmark.accuracy_smoke

gsm8k:
	$(COMPOSE) --profile tools run --rm -e MODEL_LABEL=$(MODEL_LABEL) benchmark python -m benchmark.accuracy_gsm8k

prefix-test:
	$(COMPOSE) --profile tools run --rm -e MODEL_LABEL=bf16 benchmark python -m benchmark.benchmark_prefix_cache

summary:
	uv run --group client python -m benchmark.summary

down:
	$(COMPOSE) --profile "*" down --remove-orphans

clean:
	@echo "Removing containers and model/metric volumes"
	$(COMPOSE) --profile "*" down -v --remove-orphans

test:
	uv run --group dev --group client pytest

lint:
	uv run --group dev ruff format --check .
	uv run --group dev ruff check .

format:
	uv run --group dev ruff format .
	uv run --group dev ruff check --fix .
