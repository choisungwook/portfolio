#!/usr/bin/env node

/**
 * WCAG Contrast Ratio Checker - Akbun VS Code Theme
 *
 * Verifies that foreground/background color combinations meet
 * WCAG AA accessibility standards:
 * - Normal text: minimum 4.5:1 contrast ratio
 * - Large text / UI components: minimum 3:1 contrast ratio
 *
 * References:
 * - https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
 */

const fs = require("fs");
const path = require("path");

const THEMES_DIR = path.join(__dirname, "..", "themes");

// Minimum contrast ratios (WCAG AA)
const MIN_NORMAL_TEXT = 4.5;
const MIN_LARGE_TEXT = 3.0;

let totalErrors = 0;
let totalWarnings = 0;
let totalChecks = 0;

function error(msg) {
  totalErrors++;
  console.error(`  FAIL: ${msg}`);
}

function warn(msg) {
  totalWarnings++;
  console.warn(`  WARN: ${msg}`);
}

function pass(msg) {
  totalChecks++;
  console.log(`  PASS: ${msg}`);
}

/**
 * Parse hex color to RGB values.
 * Supports #RRGGBB and #RRGGBBAA (alpha is ignored for contrast).
 */
function hexToRgb(hex) {
  const cleaned = hex.replace("#", "");
  return {
    r: parseInt(cleaned.substring(0, 2), 16),
    g: parseInt(cleaned.substring(2, 4), 16),
    b: parseInt(cleaned.substring(4, 6), 16),
  };
}

/**
 * Calculate relative luminance per WCAG 2.1
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(rgb) {
  const [rs, gs, bs] = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
  const r = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
  const g = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
  const b = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check a foreground/background pair against a minimum ratio
 */
function checkContrast(fg, bg, label, minRatio) {
  // Strip alpha channel for contrast calculation
  const fgClean = fg.substring(0, 7);
  const bgClean = bg.substring(0, 7);
  const ratio = contrastRatio(fgClean, bgClean);
  const ratioStr = ratio.toFixed(2);

  if (ratio >= minRatio) {
    pass(`${label}: ${ratioStr}:1 (min ${minRatio}:1) [${fgClean} on ${bgClean}]`);
  } else {
    error(`${label}: ${ratioStr}:1 < ${minRatio}:1 [${fgClean} on ${bgClean}]`);
  }
}

function checkTheme(filePath) {
  const fileName = path.basename(filePath);
  console.log(`\n--- Contrast check: ${fileName} ---`);

  let theme;
  try {
    theme = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    error(`Cannot parse theme: ${e.message}`);
    return;
  }

  const colors = theme.colors || {};
  const bg = colors["editor.background"];
  const fg = colors["editor.foreground"];

  if (!bg || !fg) {
    error("Missing editor.background or editor.foreground");
    return;
  }

  // 1. Editor text on editor background (normal text)
  checkContrast(fg, bg, "Editor text", MIN_NORMAL_TEXT);

  // 2. Line numbers on editor background (large text / UI)
  if (colors["editorLineNumber.foreground"]) {
    checkContrast(colors["editorLineNumber.foreground"], bg, "Line number (inactive)", MIN_LARGE_TEXT);
  }
  if (colors["editorLineNumber.activeForeground"]) {
    checkContrast(colors["editorLineNumber.activeForeground"], bg, "Line number (active)", MIN_NORMAL_TEXT);
  }

  // 3. Sidebar text on sidebar background
  const sidebarBg = colors["sideBar.background"] || bg;
  const sidebarFg = colors["sideBar.foreground"] || fg;
  checkContrast(sidebarFg, sidebarBg, "Sidebar text", MIN_NORMAL_TEXT);

  // 4. Tab text on tab background
  if (colors["tab.activeForeground"] && colors["tab.activeBackground"]) {
    checkContrast(colors["tab.activeForeground"], colors["tab.activeBackground"], "Active tab", MIN_NORMAL_TEXT);
  }
  if (colors["tab.inactiveForeground"] && colors["tab.inactiveBackground"]) {
    checkContrast(colors["tab.inactiveForeground"], colors["tab.inactiveBackground"], "Inactive tab", MIN_LARGE_TEXT);
  }

  // 5. StatusBar text on background
  if (colors["statusBar.foreground"] && colors["statusBar.background"]) {
    checkContrast(colors["statusBar.foreground"], colors["statusBar.background"], "Status bar", MIN_NORMAL_TEXT);
  }

  // 6. Terminal foreground on background
  if (colors["terminal.foreground"] && colors["terminal.background"]) {
    checkContrast(colors["terminal.foreground"], colors["terminal.background"], "Terminal text", MIN_NORMAL_TEXT);
  }

  // 7. Button text on button background
  if (colors["button.foreground"] && colors["button.background"]) {
    checkContrast(colors["button.foreground"], colors["button.background"], "Button text", MIN_NORMAL_TEXT);
  }

  // 8. Badge text on badge background
  if (colors["badge.foreground"] && colors["badge.background"]) {
    checkContrast(colors["badge.foreground"], colors["badge.background"], "Badge", MIN_NORMAL_TEXT);
  }

  // 9. Syntax token colors on editor background
  console.log(`\n  -- Syntax colors on editor background --`);
  const tokenColors = theme.tokenColors || [];
  for (const tc of tokenColors) {
    if (tc.settings && tc.settings.foreground && tc.name) {
      const tokenFg = tc.settings.foreground;
      // Skip colors with alpha < FF (semi-transparent)
      if (tokenFg.length > 7) continue;
      checkContrast(tokenFg, bg, `Syntax: ${tc.name}`, MIN_NORMAL_TEXT);
    }
  }

  // 10. ActivityBar badge contrast
  if (colors["activityBarBadge.foreground"] && colors["activityBarBadge.background"]) {
    checkContrast(
      colors["activityBarBadge.foreground"],
      colors["activityBarBadge.background"],
      "Activity bar badge",
      MIN_NORMAL_TEXT
    );
  }
}

// Run
console.log("=== Akbun Theme WCAG Contrast Checker ===");

checkTheme(path.join(THEMES_DIR, "akbun-dark.json"));
checkTheme(path.join(THEMES_DIR, "akbun-light.json"));

console.log(`\n=== Results: ${totalErrors} failures, ${totalWarnings} warnings, ${totalChecks} passed ===`);

if (totalErrors > 0) {
  console.error("\nCONTRAST CHECK HAS FAILURES - review colors above");
  process.exit(1);
} else {
  console.log("\nALL CONTRAST CHECKS PASSED");
  process.exit(0);
}
