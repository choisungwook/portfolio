import { execFile, spawn, type ChildProcess } from 'node:child_process'
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
export function startLogin(config: Config, sso: KiroSso, run: Runner = (c, a) => spawn(c, a, { stdio: ['ignore', 'pipe', 'pipe'] })): Promise<LoginState> {
  if (login?.state.running) login.child.kill()
  const child = run(config.bots.kiroPath, ['login', '--identity-provider', sso.start_url, '--region', sso.region, '--use-device-flow'])
  const state: LoginState = { running: true, url: null, code: null, output: '', exit: null }
  login = { child, state }
  return new Promise((resolve) => {
    const done = () => resolve({ ...state })
    const timer = setTimeout(done, 20_000)
    const read = (chunk: Buffer) => {
      state.output = `${state.output}${chunk.toString('utf8')}`.slice(-4000)
      state.url ??= /https:\/\/\S+/.exec(state.output)?.[0] ?? null
      state.code ??= /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/.exec(state.output)?.[1] ?? null
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

// Who kiro-cli is signed in as, or why it is not.
export function whoami(config: Config): Promise<{ signed_in: boolean; text: string }> {
  return new Promise((resolve) => {
    execFile(config.bots.kiroPath, ['whoami'], { timeout: 10_000 }, (error, stdout, stderr) => {
      const text = `${stdout}${stderr}`.trim().slice(0, 1000)
      if (error && (error as { code?: unknown }).code === 'ENOENT') resolve({ signed_in: false, text: `kiro-cli was not found (${config.bots.kiroPath})` })
      else resolve({ signed_in: !error && !/not logged in|no.*session|sign in/i.test(text), text })
    })
  })
}
