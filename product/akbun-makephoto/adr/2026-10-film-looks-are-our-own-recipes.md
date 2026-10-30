# Film looks are our own recipes

## Decision

A film look is a small set of numbers defined in `look.rs`: color strength, a contrast curve, black lift, white roll-off, shadow and highlight tints, an optional black-and-white channel mix, and grain. They are applied after the basic edit and blended by a strength slider. The ten looks have descriptive names such as Vivid Slide, Soft Portrait or Faded Matte. No LUT, profile or preset file from any vendor is included or imported, and no film stock or brand name is used.

## Reason

A look is a choice of tone and color, and writing those choices as our own parameters keeps the product free of copyrighted lookup tables and of trademarks. Descriptive names also serve the user better: "Golden Hour" says what it does, a stock name does not to someone new to photography.

A parameter recipe is also tiny, renders in the same per-pixel pass as the rest of the edit, and works identically in the CLI.
