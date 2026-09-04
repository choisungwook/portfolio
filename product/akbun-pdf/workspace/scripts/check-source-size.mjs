import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const sourceExtensions = new Set([".css", ".html", ".js", ".mjs", ".rs", ".ts"]);
const ignoredDirectories = new Set(["dist", "gen", "node_modules", "target"]);

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      return ignoredDirectories.has(name) ? [] : sourceFiles(path);
    }
    return sourceExtensions.has(extname(name)) ? [path] : [];
  });
}

const oversized = sourceFiles(root)
  .map((path) => ({
    path: relative(root, path),
    lines: readFileSync(path, "utf8").split(/\r?\n/).length,
  }))
  .filter(({ lines }) => lines >= 1000);

if (oversized.length > 0) {
  for (const file of oversized) console.error(`${file.path}: ${file.lines} lines`);
  process.exitCode = 1;
} else {
  console.log("All authored source files are under 1,000 lines.");
}
