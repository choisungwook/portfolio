# Config fields are read through alias lists

## Decision

Every quantity has an alias list, `hidden` being `hidden_size`, `n_embd`, `d_model`, `dim`, and the first alias present wins. The alias that matched is kept as `sources[key]`, next to the value.

## Reason

A config.json is not a schema. The same model shape is spelled one way by a current decoder and another way by a GPT-2 era one, and a page that reads `hidden_size` directly renders half the files on Hugging Face as an error message. The alias list makes support for a family a one line change.

Keeping the matched name is what turns the drawing into an answer about the file the reader has open, rather than about models in general. The arrows, the highlighted config lines and the tooltip footers all point at a field name that is literally in the pasted text, and a field that is absent produces no arrow rather than a lie.
