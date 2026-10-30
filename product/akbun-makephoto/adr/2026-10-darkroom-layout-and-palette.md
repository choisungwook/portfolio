# Darkroom layout with a four-color palette

## Decision

- The edit screen puts the photo on the left with a toolbar and filmstrip under it, and every panel in one column on the right, collapsible: histogram, auto, light, color, film looks. Leveling and cropping are modes opened from the toolbar under the photo, each with its own bar, and each saves only on OK or Done.
- Slider rows are name, track and value on one line, with names right-aligned and values right-aligned.
- Every color derives from four colors: cream #FCF9EA, mint #BADFDB for selection, coral #FFA4A4 for primary actions and stars, and pink #FFBDBD for hover.
- Dark is the default appearance. Light uses the cream as the panel color, and the system setting can still be followed.
- A round switch in the bottom-right corner flips light and dark and saves the choice. The page sets data-theme on the root element, so the switch takes effect at once.
- An auto button reports one line per fix, the sliders it moved and their values or that nothing was needed, and flashes the moved rows, so a click never looks like it did nothing.
- The toolbar under the photo shows icons only, with names in tooltips, so it stays on one line in a narrow window.

## Reason

- A photo editor is judged on the photo, so panels stay quiet and state is shown by fills, not borders.
- The look list with a live swatch per row lets a beginner compare looks by eye, not by name.
- A histogram shows clipped highlights and crushed shadows that are hard to judge on screen.
- One small palette keeps both appearances consistent and is defined once as CSS variables in style.css.
