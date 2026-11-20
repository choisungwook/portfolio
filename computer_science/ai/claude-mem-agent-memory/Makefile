.PHONY: up down test reset-memory

LAB_DIR ?= $(HOME)/minimem-workspace
export MINIMEM_HOME ?= $(HOME)/.minimem

up:
	cd minimem && uv sync --quiet
	rm -rf $(LAB_DIR) && mkdir -p $(LAB_DIR) && cp -R lab-template $(LAB_DIR)/shop
	sed -i.bak 's#__MINIMEM__#$(CURDIR)/minimem#g' $(LAB_DIR)/shop/.claude/settings.json $(LAB_DIR)/shop/.mcp.json
	rm -f $(LAB_DIR)/shop/.claude/settings.json.bak $(LAB_DIR)/shop/.mcp.json.bak

down:
	rm -rf $(LAB_DIR) $(MINIMEM_HOME)

reset-memory:
	rm -rf $(MINIMEM_HOME)

test:
	cd minimem && uv run python -m unittest discover -s tests -v
