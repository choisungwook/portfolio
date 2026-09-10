// Checks that run without Obsidian: the manifest, the CSS text, and the
// agreement between the Style Settings block and the CSS defaults.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const css = fs.readFileSync(path.join(root, "theme.css"), "utf8");

// The block uses a fixed shape (two-space indent, "- id:" opens an item), so a
// line parser is enough and keeps the test free of a YAML dependency.
function parseSettings(text) {
  const match = text.match(/\/\* @settings\n([\s\S]*?)\*\//);
  assert.ok(match, "theme.css has no @settings block");
  const items = [];
  let current = null;
  for (const line of match[1].split("\n")) {
    const item = line.match(/^  - id: (.+)$/);
    if (item) {
      current = { id: item[1].trim() };
      items.push(current);
      continue;
    }
    const field = line.match(/^    ([a-z-]+): (.+)$/);
    if (field && current) current[field[1]] = field[2].trim().replace(/^'|'$/g, "");
  }
  return items;
}

function blockVariables(selector) {
  const vars = new Map();
  const re = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "g");
  for (const block of css.matchAll(re)) {
    for (const decl of block[1].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
      vars.set(decl[1], decl[2].trim());
    }
  }
  return vars;
}

const settings = parseSettings(css);
const light = blockVariables(".theme-light");
const dark = blockVariables(".theme-dark");
const body = blockVariables("body");

test("manifest carries the fields Obsidian reads", () => {
  assert.equal(manifest.name, "Akbun");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.match(manifest.minAppVersion, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.author);
});

test("manifest and package.json agree on the version", () => {
  assert.equal(manifest.version, pkg.version);
});

test("theme.css stays self contained", () => {
  assert.ok(!/@import/.test(css), "no @import: Obsidian loads one file");
  assert.ok(!/url\(\s*['"]?https?:/.test(css), "no remote assets");
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  assert.equal(open, close, "braces balance");
});

test("every Style Settings variable has a CSS default", () => {
  for (const item of settings) {
    if (item.type === "heading") continue;
    const name = `--${item.id}`;
    if (item.type === "variable-themed-color") {
      assert.ok(light.has(name), `${name} missing in .theme-light`);
      assert.ok(dark.has(name), `${name} missing in .theme-dark`);
    } else {
      assert.ok(body.has(name), `${name} missing in body`);
    }
  }
});

test("Style Settings defaults match the CSS defaults", () => {
  for (const item of settings) {
    const name = `--${item.id}`;
    if (item.type === "variable-themed-color") {
      assert.equal(light.get(name), item["default-light"], `${name} light default`);
      assert.equal(dark.get(name), item["default-dark"], `${name} dark default`);
    } else if (item.type && item.type.startsWith("variable-")) {
      assert.equal(body.get(name), item.default, `${name} default`);
    }
  }
});

test("every referenced --akbun and --ctp variable is defined", () => {
  const defined = new Set([...light.keys(), ...dark.keys(), ...body.keys()]);
  for (const ref of css.matchAll(/var\((--(?:akbun|ctp)-[a-z0-9-]+)\)/g)) {
    assert.ok(defined.has(ref[1]), `${ref[1]} is referenced but never defined`);
  }
});

test("palette is complete in both modes", () => {
  const lightPalette = [...light.keys()].filter((k) => k.startsWith("--ctp-")).sort();
  const darkPalette = [...dark.keys()].filter((k) => k.startsWith("--ctp-")).sort();
  assert.deepEqual(lightPalette, darkPalette);
  assert.ok(lightPalette.length >= 26);
});
