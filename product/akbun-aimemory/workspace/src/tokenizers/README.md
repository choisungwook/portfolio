# Open-source subword tokenizers

`akbun-aimemory` ships with a model-free `builtin` tokenizer (Latin words, CJK character bigrams, Hangul words + bigrams). When you want higher precision on Korean, Japanese, Chinese and mixed technical text without running an embedding model, switch to an open-source subword tokenizer via `hf-json` or `command`.

## Recommended open-source tokenizers

| Tokenizer | Type | Why it fits |
|---|---|---|
| **Google Gemma 3** (`tokenizer.json` / `tokenizer.model`) | SentencePiece (262k vocab) | Strong multilingual coverage across Korean, Japanese, Chinese and English, plus code identifiers. Works directly via `hf-json` (`tokenizer.json`) or `command` (`tokenizer.model`). |
| **XLM-RoBERTa** (`tokenizer.json` / `sentencepiece.bpe.model`) | SentencePiece Unigram (250k vocab) | Widely available MIT-licensed multilingual vocabulary. Works directly via `hf-json`, or through Microsoft BlingFire's C++ wrapper via `command` when you want native speed in an existing BlingFire environment. |

## Option 1: HuggingFace `tokenizer.json` (`hf-json`)

No Python or native library is needed. Point `aimemory.config.json` at a local HuggingFace `tokenizer.json` (Unigram or BPE):

```json
{
  "tokenizer": {
    "type": "hf-json",
    "path": "/path/to/tokenizer.json"
  }
}
```

A relative `path` is resolved against the current directory first, then `$AIMEMORY_HOME`.

## Option 2: External `command` adapter (SentencePiece / BlingFire)

For `.model` files (SentencePiece) or native wrappers such as Microsoft BlingFire, configure a `command` adapter that reads text on stdin and prints a JSON string array or whitespace-separated tokens on stdout.

An example SentencePiece adapter is included at `src/tokenizers/sentencepiece_command.py`:

```bash
uv pip install sentencepiece
```

```json
{
  "tokenizer": {
    "type": "command",
    "command": "python3",
    "args": [
      "/path/to/product/akbun-aimemory/workspace/src/tokenizers/sentencepiece_command.py",
      "--model",
      "/path/to/tokenizer.model"
    ]
  }
}
```

## Reindexing after switching

Vectors and FTS5 rows depend on the tokenizer output. After changing `tokenizer` in `aimemory.config.json`, `aimem` warns when opening the database until you rebuild the index:

```bash
aimem reindex
```
