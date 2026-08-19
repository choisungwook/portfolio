# Measured throughput is the capacity input

## Decision

Ask for measured prefill and decode throughput per complete serving replica. Do not estimate those values from model parameter count, advertised GPU FLOPS, or memory bandwidth.

## Reason

Theoretical estimates are useful for comparing shapes before a model runs, but serving throughput also depends on kernels, quantization, tensor parallel communication, context length, batch composition, scheduler policy, and software version. A capacity result built on advertised peak hardware numbers would look precise while carrying too little of the deployment.

A production-like benchmark already includes those choices. The page explains how to derive prompt throughput from vLLM benchmark output and keeps model and hardware names out of the formula. This makes the calculator portable across vLLM, other engines, and future GPUs as long as the two token budgets are measured consistently.
