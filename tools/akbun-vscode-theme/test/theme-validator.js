#!/usr/bin/env node

/**
 * Theme Validator - Akbun VS Code Theme
 *
 * Validates that both theme JSON files:
 * 1. Are valid JSON
 * 2. Have required top-level keys
 * 3. Have essential VS Code color keys defined
 * 4. Have tokenColors with proper structure
 * 5. Use valid hex color format
 * 6. Have matching syntax categories between dark and light themes
 */

const fs = require("fs");
const path = require("path");

const THEMES_DIR = path.join(__dirname, "..", "themes");
const THEME_FILES = ["akbun-dark.json", "akbun-light.json"];

// Required top-level keys in a VS Code theme
const REQUIRED_TOP_KEYS = ["name", "type", "colors", "tokenColors"];

// Essential VS Code UI color keys that must be present
const REQUIRED_COLOR_KEYS = [
  "editor.background",
  "editor.foreground",
  "editor.selectionBackground",
  "editor.lineHighlightBackground",
  "editorCursor.foreground",
  "editorLineNumber.foreground",
  "editorLineNumber.activeForeground",
  "editorError.foreground",
  "editorWarning.foreground",
  "activityBar.background",
  "activityBar.foreground",
  "sideBar.background",
  "sideBar.foreground",
  "titleBar.activeBackground",
  "tab.activeBackground",
  "tab.inactiveBackground",
  "statusBar.background",
  "statusBar.foreground",
  "terminal.background",
  "terminal.foreground",
  "terminal.ansiRed",
  "terminal.ansiGreen",
  "terminal.ansiBlue",
  "terminal.ansiYellow",
  "input.background",
  "input.foreground",
  "button.background",
  "button.foreground",
  "panel.background",
  "gitDecoration.addedResourceForeground",
  "gitDecoration.modifiedResourceForeground",
  "gitDecoration.deletedResourceForeground",
];

// Essential syntax scopes that must be highlighted (especially for HCL, Ansible, Python, JS)
const REQUIRED_SYNTAX_CATEGORIES = [
  "Comment",
  "String",
  "Number",
  "Keyword",
  "Function declaration",
  "Function parameter",
  "Variable",
  "Class / Type",
  "Decorator / Annotation",
  "Python - Self",
  "Python - Decorator",
  "JavaScript/TypeScript - this",
  "HCL / Terraform - Block type",
  "HCL / Terraform - Resource name / label",
  "HCL / Terraform - Attribute name",
  "YAML key",
];

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

let totalErrors = 0;
let totalWarnings = 0;

function error(msg) {
  totalErrors++;
  console.error(`  ERROR: ${msg}`);
}

function warn(msg) {
  totalWarnings++;
  console.warn(`  WARN:  ${msg}`);
}

function pass(msg) {
  console.log(`  PASS:  ${msg}`);
}

function validateHexColor(color, context) {
  if (!HEX_COLOR_REGEX.test(color)) {
    error(`Invalid hex color "${color}" in ${context}`);
    return false;
  }
  return true;
}

function validateTheme(filePath) {
  const fileName = path.basename(filePath);
  console.log(`\n--- Validating: ${fileName} ---`);

  // 1. Check file exists
  if (!fs.existsSync(filePath)) {
    error(`File not found: ${filePath}`);
    return null;
  }
  pass("File exists");

  // 2. Parse JSON
  let theme;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    theme = JSON.parse(raw);
  } catch (e) {
    error(`Invalid JSON: ${e.message}`);
    return null;
  }
  pass("Valid JSON");

  // 3. Required top-level keys
  for (const key of REQUIRED_TOP_KEYS) {
    if (!(key in theme)) {
      error(`Missing required top-level key: "${key}"`);
    }
  }
  pass("Top-level keys present");

  // 4. Theme type
  const expectedType = fileName.includes("dark") ? "dark" : "light";
  if (theme.type !== expectedType) {
    error(`Theme type should be "${expectedType}", got "${theme.type}"`);
  } else {
    pass(`Theme type is "${expectedType}"`);
  }

  // 5. Required color keys
  const colors = theme.colors || {};
  let missingColors = 0;
  for (const key of REQUIRED_COLOR_KEYS) {
    if (!(key in colors)) {
      error(`Missing required color key: "${key}"`);
      missingColors++;
    }
  }
  if (missingColors === 0) {
    pass(`All ${REQUIRED_COLOR_KEYS.length} required color keys present`);
  }

  // 6. Validate hex color format in colors
  let invalidColors = 0;
  for (const [key, value] of Object.entries(colors)) {
    if (!validateHexColor(value, `colors.${key}`)) {
      invalidColors++;
    }
  }
  if (invalidColors === 0) {
    pass(`All ${Object.keys(colors).length} color values are valid hex`);
  }

  // 7. TokenColors structure
  const tokenColors = theme.tokenColors || [];
  if (tokenColors.length === 0) {
    error("tokenColors array is empty");
  } else {
    pass(`${tokenColors.length} tokenColor rules defined`);
  }

  // 8. Validate each tokenColor entry
  let invalidTokens = 0;
  for (let i = 0; i < tokenColors.length; i++) {
    const tc = tokenColors[i];
    if (!tc.scope) {
      error(`tokenColors[${i}] (${tc.name || "unnamed"}) missing "scope"`);
      invalidTokens++;
    }
    if (!tc.settings) {
      error(`tokenColors[${i}] (${tc.name || "unnamed"}) missing "settings"`);
      invalidTokens++;
    } else {
      if (tc.settings.foreground) {
        if (!validateHexColor(tc.settings.foreground, `tokenColors[${i}].settings.foreground (${tc.name})`)) {
          invalidTokens++;
        }
      }
    }
  }
  if (invalidTokens === 0) {
    pass("All tokenColor entries have valid structure");
  }

  // 9. Check required syntax categories
  const tokenNames = tokenColors.map((tc) => tc.name).filter(Boolean);
  let missingSyntax = 0;
  for (const cat of REQUIRED_SYNTAX_CATEGORIES) {
    if (!tokenNames.includes(cat)) {
      error(`Missing required syntax category: "${cat}"`);
      missingSyntax++;
    }
  }
  if (missingSyntax === 0) {
    pass(`All ${REQUIRED_SYNTAX_CATEGORIES.length} required syntax categories present`);
  }

  return theme;
}

function validateConsistency(dark, light) {
  console.log("\n--- Cross-theme consistency ---");

  if (!dark || !light) {
    error("Cannot check consistency: one or both themes failed to load");
    return;
  }

  // Token color names should match between themes
  const darkNames = new Set((dark.tokenColors || []).map((tc) => tc.name).filter(Boolean));
  const lightNames = new Set((light.tokenColors || []).map((tc) => tc.name).filter(Boolean));

  const onlyInDark = [...darkNames].filter((n) => !lightNames.has(n));
  const onlyInLight = [...lightNames].filter((n) => !darkNames.has(n));

  if (onlyInDark.length > 0) {
    warn(`Syntax rules only in dark theme: ${onlyInDark.join(", ")}`);
  }
  if (onlyInLight.length > 0) {
    warn(`Syntax rules only in light theme: ${onlyInLight.join(", ")}`);
  }
  if (onlyInDark.length === 0 && onlyInLight.length === 0) {
    pass("Both themes have matching syntax rule names");
  }

  // Color keys should match between themes
  const darkColorKeys = new Set(Object.keys(dark.colors || {}));
  const lightColorKeys = new Set(Object.keys(light.colors || {}));

  const onlyInDarkColors = [...darkColorKeys].filter((k) => !lightColorKeys.has(k));
  const onlyInLightColors = [...lightColorKeys].filter((k) => !darkColorKeys.has(k));

  if (onlyInDarkColors.length > 0) {
    warn(`Color keys only in dark theme: ${onlyInDarkColors.join(", ")}`);
  }
  if (onlyInLightColors.length > 0) {
    warn(`Color keys only in light theme: ${onlyInLightColors.join(", ")}`);
  }
  if (onlyInDarkColors.length === 0 && onlyInLightColors.length === 0) {
    pass("Both themes define the same color keys");
  }

  // Semantic token colors should match
  const darkSemantic = Object.keys(dark.semanticTokenColors || {});
  const lightSemantic = Object.keys(light.semanticTokenColors || {});
  const onlyInDarkSemantic = darkSemantic.filter((k) => !(k in (light.semanticTokenColors || {})));
  const onlyInLightSemantic = lightSemantic.filter((k) => !(k in (dark.semanticTokenColors || {})));

  if (onlyInDarkSemantic.length > 0) {
    warn(`Semantic tokens only in dark: ${onlyInDarkSemantic.join(", ")}`);
  }
  if (onlyInLightSemantic.length > 0) {
    warn(`Semantic tokens only in light: ${onlyInLightSemantic.join(", ")}`);
  }
  if (onlyInDarkSemantic.length === 0 && onlyInLightSemantic.length === 0) {
    pass("Both themes define the same semantic token colors");
  }
}

// Run
console.log("=== Akbun Theme Validator ===");

const themes = THEME_FILES.map((f) => validateTheme(path.join(THEMES_DIR, f)));
validateConsistency(themes[0], themes[1]);

console.log(`\n=== Results: ${totalErrors} errors, ${totalWarnings} warnings ===`);

if (totalErrors > 0) {
  console.error("\nVALIDATION FAILED");
  process.exit(1);
} else {
  console.log("\nVALIDATION PASSED");
  process.exit(0);
}
