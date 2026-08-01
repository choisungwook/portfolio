'use strict';

// Font picker shared by the settings window and the editor toolbar.

// macOS bundled families that cover Korean and English. Used when the local
// font list is unavailable, so the picker is never empty.
const FALLBACK_FONTS = ['Apple SD Gothic Neo', 'AppleGothic', 'Helvetica', 'Menlo'];

async function loadFontFamilies() {
  try {
    const fonts = await window.queryLocalFonts();
    const families = [...new Set(fonts.map((font) => font.family))].sort();
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

// queryLocalFonts needs the local-fonts permission, and Chromium may still ask
// for a user gesture before handing over the list. The load at start covers the
// granted case; the first click in the window covers the rest.
function wireFontSelect(select, getCurrent) {
  const load = async () => fillFontSelect(select, await loadFontFamilies(), getCurrent());
  void load();
  window.addEventListener('pointerdown', () => void load(), { once: true });
}
