.PHONY: check test clean

UV := UV_CACHE_DIR=.uv-cache uv

check:
	$(UV) run python scripts/sandbox_probe.py

test:
	$(UV) run python -m unittest discover -s tests

clean:
	rm -f .sandbox-probe-workspace.txt
	rm -f /tmp/ai-agent-sandbox-outside-write.txt
	-rm -f /Users/Shared/ai-agent-sandbox-outside-write.txt
