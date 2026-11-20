import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { Config } from '../../config.ts'
import type { Db } from '../../db/open.ts'
import { getMeta, setMeta } from '../../db/meta.ts'

// Kiro signs in with the user's AWS IAM Identity Center (SSO): `kiro-cli login --identity-provider <start URL> --region
// <region> --use-device-flow` prints a verification URL and a one-time code, the user approves them in any browser, and
// kiro-cli keeps the session for later headless runs. taskq starts that command, shows the URL and code in Settings,
// and asks `kiro-cli whoami` for the state. The token stays with kiro-cli.

export interface KiroSso {
  start_url: string
  region: string
}

export interface LoginState {
  running: boolean
  url: string | null
  code: string | null
  output: string
  exit: number | null
}

export type Runner = (command: string, args: string[]) => ChildProcess

// kiro-cli asks for the start URL and region on a terminal even when both flags are given, and fails without one. So
// the login runs under a terminal of its own and Enter accepts each value it already has. expect(1) does both (macOS
// ships it; its script(1) needs a terminal itself). Without expect, util-linux script(1) gives the terminal and
// startLogin sends the Enters.
// Tcl braces quote each word as it is; a word with a brace of its own cannot be quoted this way and is refused.
const tcl = (word: string) => {
  if (/[{}\\]/.test(word)) throw new Error('the kiro-cli path, start URL and region cannot contain braces or backslashes')
  return `{${word}}`
}
const expectScript = (command: string, args: string[]) =>
  `set timeout -1; spawn -noecho ${[command, ...args].map(tcl).join(' ')}; expect -re {Enter (Start URL|Region)} { send "\\r"; exp_continue } eof; catch wait ended; exit [lindex $ended 3]`
const underTerminal: Runner = (command, args) => existsSync('/usr/bin/expect')
  ? spawn('/usr/bin/expect', ['-c', expectScript(command, args)], { stdio: ['ignore', 'pipe', 'pipe'] })
  : spawn('script', ['-qec', [command, ...args].map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' '), '/dev/null'], { stdio: ['pipe', 'pipe', 'pipe'] })
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|\r/g
const ASKS = /Enter (Start URL|Region)/gi

const START_URL = /^https:\/\/[a-z0-9.-]+\.(awsapps\.com|amazonaws\.com|aws)\/start\/?#?\/?$|^https:\/\/[a-z0-9-]+\.awsapps\.com\/start/i
const REGION = /^[a-z]{2}(-[a-z]+)+-\d$/

export function kiroSso(db: Db): KiroSso {
  return { start_url: getMeta(db, 'kiro_start_url') ?? '', region: getMeta(db, 'kiro_region') ?? 'us-east-1' }
}

export function setKiroSso(db: Db, sso: KiroSso): string | null {
  if (!START_URL.test(sso.start_url)) return 'the start URL looks like https://<name>.awsapps.com/start'
  if (!REGION.test(sso.region)) return 'the region looks like us-east-1'
  setMeta(db, 'kiro_start_url', sso.start_url)
  setMeta(db, 'kiro_region', sso.region)
  return null
}

let login: { child: ChildProcess; state: LoginState } | null = null

export function loginState(): LoginState | null {
  return login?.state ?? null
}

// Starts the device-flow login and resolves once the URL and code appear (or the command ends, or 20 s pass).
export function startLogin(config: Config, sso: KiroSso, run: Runner = underTerminal): Promise<LoginState> {
  if (login?.state.running) login.child.kill()
  const child = run(config.bots.kiroPath, ['login', '--use-device-flow', '--identity-provider', sso.start_url, '--license', 'pro', '--region', sso.region])
  const state: LoginState = { running: true, url: null, code: null, output: '', exit: null }
  login = { child, state }
  // A device code is good for about ten minutes; a login nobody finished is not left running.
  setTimeout(() => { if (state.running) child.kill() }, 15 * 60_000).unref()
  return new Promise((resolve) => {
    const done = () => resolve({ ...state })
    const timer = setTimeout(done, 20_000)
    let asked = 0
    let seenAsks = 0
    const read = (chunk: Buffer) => {
      const text = chunk.toString('utf8').replace(ANSI, '')
      // One Enter per question, counted over everything read so a question split across chunks is answered once.
      seenAsks += (`${state.output.slice(-20)}${text}`.match(ASKS) ?? []).length - (state.output.slice(-20).match(ASKS) ?? []).length
      for (; asked < seenAsks; asked += 1) child.stdin?.write('\r')
      state.output = `${state.output}${text}`.slice(-4000)
      // The prompts are part of the output now and can show the start URL: the page to open is another address, the
      // one that names the device or the code when there is such a one.
      const urls = (state.output.match(/https:\/\/[^\s'"<>]+/g) ?? []).map((u) => u.replace(/[).,:;\]]+$/, ''))
        .filter((u) => !u.startsWith(sso.start_url.replace(/[/#]+$/, '')))
      state.url = urls.find((u) => /device|user_code/i.test(u)) ?? urls[0] ?? null
      state.code ??= /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/.exec(state.output)?.[1] ?? /code[:\s]+([A-Z0-9]{4,}(?:-[A-Z0-9]{4,})?)\b/.exec(state.output)?.[1] ?? null
      if (state.url && state.code) {
        clearTimeout(timer)
        done()
      }
    }
    child.stdout?.on('data', read)
    child.stderr?.on('data', read)
    child.once('error', (error) => {
      state.running = false
      state.output += `\n${error.message}`
      clearTimeout(timer)
      done()
    })
    child.once('exit', (code) => {
      state.running = false
      state.exit = code
      clearTimeout(timer)
      done()
    })
  })
}

// Who kiro-cli is signed in as, or why it is not. signed_out is the certain case only (a non-zero exit that says so):
// a timeout or another error does not prove the login is gone, and a bot is turned off only on proof.
// 30 s, because with an expired cached token whoami first refreshes it against IAM Identity Center, which takes 12-20 s.
export type WhoamiRun = (command: string, args: string[], done: (error: (Error & { code?: unknown; killed?: boolean }) | null, stdout: string, stderr: string) => void) => void
const runWhoami: WhoamiRun = (command, args, done) => { execFile(command, args, { timeout: 30_000 }, done) }

export function whoami(config: Config, run: WhoamiRun = runWhoami): Promise<{ signed_in: boolean; signed_out: boolean; text: string }> {
  return new Promise((resolve) => {
    run(config.bots.kiroPath, ['whoami'], (error, stdout, stderr) => {
      const text = `${stdout}${stderr}`.trim().slice(0, 1000)
      const says = /not logged in/i.test(text)
      if (error && error.code === 'ENOENT') resolve({ signed_in: false, signed_out: false, text: `kiro-cli was not found (${config.bots.kiroPath})` })
      else if (error?.killed) resolve({ signed_in: false, signed_out: false, text: 'kiro-cli whoami did not answer in 30 s; check the network and try again' })
      else resolve({ signed_in: !error && !says && !/no.*session|sign in/i.test(text), signed_out: Boolean(error) && says, text })
    })
  })
}
