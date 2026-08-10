# Products are web or desktop, and nothing else

## Decision

The filter row is `web`, `desktop` and `reference`. There is no `server` chip; the one product that runs as a server, akbun-terraform-apply-remote, is filed under `web`.

## Reason

The chips answer one question, "how do I use this", and there are two answers: open it in a browser or install it. A `server` chip split the row on how a product is *built* instead, which is a different question and one the tags already answer — that entry carries `rust` and `terraform`, and searching either finds it.

It was also a chip with a single product behind it. A filter that narrows twenty items to one is a link, not a filter, and it cost a fifth of the row's width to say so.

`reference` stays because the two layout libraries are genuinely neither: nothing is installed and nothing is used in a browser, they are read by an agent. That is a use, so it earns a chip.
