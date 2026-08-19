# Latency and KV cache stay explicit estimates

## Decision

Include latency and KV cache calculations, label them as estimates, show their equations in the result panel, and document the effects they do not model.

## Reason

RPS alone is not enough to size interactive inference. A deployment can meet average volume while producing unacceptable inter-token latency or exhausting KV cache at the required concurrency. Removing these estimates would force the same arithmetic into a separate spreadsheet.

The arithmetic is useful only within its limits. Aggregate throughput does not produce queueing percentiles, and the standard KV shape does not cover every attention implementation. Keeping the formulas expandable beside the numbers makes the assumptions part of the output rather than a disclaimer hidden in project documentation.
