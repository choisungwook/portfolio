'use strict';

// Kiro keeps no local usage log and has no public usage API, so the app runs
// the CLI's /usage in non-interactive mode and parses the printed card:
//
//   Estimated Usage | resets on 2026-09-01 | KIRO PRO
//   Credits (10 of 100 covered in plan)
//   ████ 10%

const { execFile } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const RUN_TIMEOUT_MS = 30_000;

function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');
}

function toNumber(text) {
  return Number(text.replace(/,/g, ''));
}

function parseKiroUsage(raw) {
  const text = stripAnsi(raw);
  const header = text.match(/Estimated Usage\s*\|\s*resets on (\d{4}-\d{2}-\d{2})\s*\|\s*([^\n]+)/i);
  const credits = text.match(/Credits\s*\(([\d,.]+)\s+of\s+([\d,.]+)\s+covered in plan\)/i);
  if (!credits) return null;
  const used = toNumber(credits[1]);
  const limit = toNumber(credits[2]);
  const percentMatch = text.match(/(?:^|\s)(\d+(?:\.\d+)?)%\s*$/m);
  return {
    plan: header ? header[2].trim() : null,
    used,
    limit,
    percent: percentMatch ? Number(percentMatch[1]) : limit > 0 ? (used / limit) * 100 : 0,
    resetsAt: header ? Date.parse(`${header[1]}T00:00:00`) : null,
  };
}

// Apps launched from Finder get a bare PATH, so the usual install locations
// are added before looking up the CLI.
function cliEnv(env = process.env) {
  const extra = [path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  return { ...env, PATH: [env.PATH, ...extra].filter(Boolean).join(path.delimiter) };
}

function runKiroUsage(command) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      ['chat', '/usage', '--no-interactive', '--wrap', 'never'],
      { env: cliEnv(), timeout: RUN_TIMEOUT_MS },
      (error, stdout, stderr) => {
        const usage = parseKiroUsage(`${stdout}\n${stderr}`);
        if (usage) return resolve(usage);
        if (error?.code === 'ENOENT') return reject(new Error(`${command} not found`));
        reject(error ?? new Error('kiro-cli /usage printed no credits line'));
      }
    );
  });
}

module.exports = { cliEnv, parseKiroUsage, runKiroUsage, stripAnsi };
