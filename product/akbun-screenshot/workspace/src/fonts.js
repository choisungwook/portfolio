'use strict';

// Font picker shared by the settings window and the editor toolbar.

// macOS bundled families that cover Korean and English. Used when the font
// list cannot be read, so the picker is never empty.
const FALLBACK_FONTS = ['Apple SD Gothic Neo', 'AppleGothic', 'Helvetica', 'Menlo'];

// WKWebView has no queryLocalFonts, so the families come from the app, which
// reads the system font directories.
async function loadFontFamilies() {
  try {
    const families = await window.api.listFonts();
    return families.length > 0 ? families : FALLBACK_FONTS;
  } catch {
    return FALLBACK_FONTS;
  }
}

// Keeps the stored family selectable even when it is no longer installed,
// so opening the picker cannot silently change the setting.
function fillFontSelect(select, families, current) {
  const list = families.includes(current) ? families : [current, ...families];
  select.replaceChildren(
    ...list.map((family) => new Option(family, family))
  );
  select.value = current;
}

function wireFontSelect(select, getCurrent) {
  void loadFontFamilies().then((families) => fillFontSelect(select, families, getCurrent()));
}
