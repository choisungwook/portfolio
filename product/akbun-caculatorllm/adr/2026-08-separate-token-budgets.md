# Prefill and decode remain separate budgets

## Decision

Convert prefill tokens per second and decode tokens per second into independent request limits, then choose the smaller limit. Never add the two token rates before calculating requests per second.

## Reason

A request consumes prompt tokens during prefill and output tokens during decode. The phases exercise the serving system differently and a workload can saturate one while leaving capacity in the other. One combined token number hides that condition and cannot say whether reducing prompt length or output length helps.

Separate budgets also make target utilization readable. Operators can see that a deployment is decode-bound even when aggregate tokens per second looks comfortable, and can benchmark or tune the limiting phase instead of the entire system blindly.
