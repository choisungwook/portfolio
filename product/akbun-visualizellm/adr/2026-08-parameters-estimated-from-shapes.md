# Parameters are estimated from the shapes

## Decision

Compute the parameter count from the config alone, per block, per layer and in total, and label it as an estimate everywhere it is shown.

## Reason

Size is the first question anyone asks of a model, and a config.json is often all that is at hand: the weights are tens of gigabytes away and a page that reads them in the browser is a different product. The shapes in the config determine the count to within a percent, so the estimate is worth far more than a blank.

It is called an estimate because the parts left out are real: biases where a family uses them, learned position tables, and anything an architecture adds outside the standard block. Rather than chase those, the count is checked from a second direction, by asserting that the boxes placed in the 3D scene add up to the same number. A matrix added to one and forgotten in the other fails that test.
