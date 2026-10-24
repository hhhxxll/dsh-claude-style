/**
 * Desktop application restart (D75): the host half's one write-side route.
 *
 * The restart contract, ported from dsh-glass and dsh-quick-tools: answer the
 * request first, hand the relaunch to a detached helper that outlives this
 * process, then stop. The helper must wait for the listening socket to go
 * quiet before it starts the replacement — a released port can still be held
 * for a moment, and a replacement that loses that race dies with EADDRINUSE,
 * leaving the user with no service.
 *
 * The app must be relaunched BY EXECUTABLE, never by replaying a command
 * line: the desktop host's entry is `app.asar\dsh\node_modules\…\lib\index.js`,
 * not a CLI entry, so a CLI-shaped relaunch starts the global `dsh` against an
 * asar profile path — a different, unmanaged server. There is also no graceful
 * quit to reuse (the shell's close handler hides to the tray), so the stop is
 * forceful, which is why the browser half asks for confirmation first.
 *
 * The helper is a Node script run by the shell's own executable with
 * `ELECTRON_RUN_AS_NODE`: it allocates no console (a GUI binary), the work is
 * direct syscalls, and it is guaranteed present — the very process running
 * this code. One child remains unavoidable (`tasklist`, hidden, piped): no
 * syscall returns a process NAME, and the name check is what stops a recycled
 * pid from being killed.
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RESTART_PATH } from '@dsh-claude-style/contracts/routes'
import { fenceRefused, methodRefused, sendJson } from '@dsh-claude-style/engine/node/http'
import { packageRoot } from './package-root.js'
import type { DshContext, DshRequest, DshResponse, DshRoute } from '@dsh-claude-style/engine/node/dsh'

/** Unique identity of this server boot; the browser half compares it to tell the old process from the new. */
export const BOOT_ID = `${process.pid}-${Date.now()}`

/** How long a restart refusal holds: the helper gets its processes stopped within seconds, this only debounces. */
const IN_FLIGHT_MS = 15_000

/** Where the helper script and its logs go: this package's own `.debug/` scratch (never the system temp). */
function scratchDir() {
  const dir = join(packageRoot(), '.debug', 'restart')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Whether this host runs inside the Windows desktop shell. The shell launches
 * its host with the app executable and an absolute `app.asar\dsh\…` profile
 * path; `argv` carries it, and an environment marker never would (the shell's
 * environment is inherited by plugins that have nothing to do with it).
 */
export function isDesktopHost(argv: readonly string[] = process.argv) {
  return argv.some((arg) => /[\\/]app\.asar[\\/]/i.test(arg))
}

/**
 * The port the browser actually reached this host on: the Host header is the
 * only request-side source of truth (`req.url` carries a path only), and it
 * is the port the replacement has to take over.
 */
export function servingPort(host: string | undefined): number | null {
  if (host !== undefined) {
    const match = /:(\d{1,5})$/.exec(host)
    if (match !== null) {
      const port = Number(match[1])
      if (Number.isInteger(port) && port > 0 && port < 65536) return port
    }
  }
  return null
}

/** Process ids a desktop restart must stop: the host and the shell above it (its parent, same executable). */
export function desktopRestartTargets() {
  const shell = process.ppid
  return { host: process.pid, shell: shell > 0 && shell !== process.pid ? shell : undefined }
}

/**
 * Source of the detached helper that restarts the Windows desktop app. Each
 * embedded value is JSON-encoded, so a path with spaces or quotes cannot
 * break out of its literal.
 *
 * @param exe - the desktop shell executable to relaunch, and the helper runtime.
 * @param targets - the host and shell process ids to stop.
 * @param port - the port this host serves on, so the helper waits for the stop.
 * @param logs - where the helper appends its steps, one line each.
 */
export function getDesktopRestartHelperSource(exe: string, targets: { host: number, shell?: number }, port: number | null, logs: { out: string, err: string }) {
  const ids = [targets.host, targets.shell].filter((id): id is number => typeof id === 'number' && id > 0)
  return [
    '"use strict";',
    'const { spawn } = require("node:child_process");',
    'const { appendFileSync } = require("node:fs");',
    'const net = require("node:net");',
    `const LOG = ${JSON.stringify(logs.err)};`,
    `const EXE = ${JSON.stringify(exe)};`,
    `const IDS = ${JSON.stringify(ids)};`,
    `const PORT = ${port === null ? 'null' : String(port)};`,
    `const EXE_NAME = ${JSON.stringify(exe.replace(/^.*[\\/]/u, '').replace(/\.[^.]*$/u, ''))};`,
    'const log = (line) => {',
    '  try { appendFileSync(LOG, `[dsh-claude-style-restart] ${line}\\n`); } catch {}',
    '};',
    'const listening = () => new Promise((resolve) => {',
    '  if (PORT === null) return resolve(false);',
    "  const socket = net.connect({ port: PORT, host: '127.0.0.1' });",
    '  const done = (value) => { socket.destroy(); resolve(value); };',
    '  socket.setTimeout(1000);',
    "  socket.once('connect', () => done(true));",
    "  socket.once('timeout', () => done(false));",
    "  socket.once('error', () => done(false));",
    '});',
    'const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));',
    'const nameOf = (pid) => new Promise((resolve) => {',
    '  const child = spawn("tasklist", ["/FI", "PID eq " + pid, "/FO", "CSV", "/NH"], {',
    '    windowsHide: true,',
    "    stdio: ['ignore', 'pipe', 'ignore'],",
    '  });',
    "  let text = '';",
    "  child.stdout.on('data', (chunk) => { text += String(chunk); });",
    "  child.once('error', () => resolve(null));",
    "  child.once('close', () => {",
    '    const match = /^"([^"]+)"/mu.exec(text);',
    '    resolve(match === null ? null : match[1]);',
    '  });',
    '});',
    'const live = (pid) => {',
    '  try { process.kill(pid, 0); return true; } catch { return false; }',
    '};',
    '(async () => {',
    "  log('start');",
    '  await sleep(900);',
    '  for (const pid of IDS) {',
    '    let actual = null;',
    '    try { actual = await nameOf(pid); } catch (error) { log(`query failed for ${pid}: ${error}`); }',
    '    if (actual === null) {',
    '      if (!live(pid)) { log(`pid ${pid} already gone`); continue; }',
    '      log(`pid ${pid} is live but its name could not be read - skipped`);',
    '      continue;',
    '    }',
    "    const bare = actual.replace(/\\.[^.]*$/u, '');",
    '    if (bare.toLowerCase() !== EXE_NAME.toLowerCase()) {',
    '      log(`pid ${pid} is ${actual}, not ${EXE_NAME} - skipped`);',
    '      continue;',
    '    }',
    "    try { process.kill(pid, 'SIGKILL'); log(`stopped ${pid}`); }",
    '    catch (error) { log(`could not stop ${pid}: ${error}`); }',
    '  }',
    '  const deadline = Date.now() + 20000;',
    '  while (Date.now() < deadline && (await listening())) await sleep(400);',
    '  await sleep(600);',
    '  const appEnv = { ...process.env };',
    '  delete appEnv.ELECTRON_RUN_AS_NODE;',
    '  try {',
    "    const app = spawn(EXE, [], { detached: true, stdio: 'ignore', windowsHide: false, env: appEnv });",
    '    app.unref();',
    "    log('relaunched');",
    '  } catch (error) {',
    '    log(`relaunch failed: ${error}`);',
    '  }',
    '})();',
  ].join('\r\n')
}

/**
 * Write the helper script and start it detached: it outlives the processes it
 * stops, and every step lands in the log beside it.
 *
 * @param port - the port this process serves on, so the helper can wait on it.
 * @returns the helper's pid and its log paths.
 */
export function scheduleDesktopRestart(port: number | null) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const nonce = randomUUID().slice(0, 8)
  const dir = scratchDir()
  const logOut = join(dir, `restart-${stamp}-${nonce}.out.log`)
  const logErr = join(dir, `restart-${stamp}-${nonce}.err.log`)
  const script = getDesktopRestartHelperSource(process.execPath, desktopRestartTargets(), port, { out: logOut, err: logErr })
  const helperPath = join(dir, `restart-${stamp}-${nonce}.cjs`)
  writeFileSync(helperPath, script, 'utf8')
  const helper = spawn(process.execPath, [helperPath], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true,
  })
  let spawnFailed = false
  helper.on('error', (error) => {
    spawnFailed = true
    console.warn(`dsh-claude-style: could not start the desktop restart helper: ${String(error)}`)
  })
  helper.unref()
  return { helperPid: spawnFailed ? undefined : helper.pid, logOut, logErr }
}

/**
 * The restart route: `GET` answers the boot identity and whether this host is
 * the desktop shell; `POST` relaunches the desktop app. The refusal window is
 * held by this closure (created once per `registerRoutes`), never on the
 * function object: a hot re-apply between two requests within the window
 * keeps a fresh closure, so a stale flag never refuses a later restart.
 *
 * @param ctx - host plugin context (the fence reads the connection service).
 */
export function restartRoute(ctx: DshContext): DshRoute {
  let inFlightUntil = 0
  return {
    kind: 'exact',
    path: RESTART_PATH,
    handler: (req: DshRequest, res: DshResponse) => {
      if (fenceRefused(ctx, req, res)) return
      if (methodRefused(req, res, ['GET', 'POST'])) return
      if (req.method === 'GET') {
        sendJson(res, 200, { ok: true, boot: BOOT_ID, desktop: isDesktopHost(), uptime: process.uptime() })
        return
      }
      if (!isDesktopHost()) {
        sendJson(res, 409, { ok: false, error: 'desktop-only' })
        return
      }
      const now = Date.now()
      if (now < inFlightUntil) {
        sendJson(res, 409, { ok: false, error: 'in-flight' })
        return
      }
      inFlightUntil = now + IN_FLIGHT_MS
      // The answer goes out before the relaunch: the helper kills this
      // process, and the browser half must already hold the response.
      sendJson(res, 200, { ok: true, boot: BOOT_ID, port: servingPort(req.headers.host) })
      scheduleDesktopRestart(servingPort(req.headers.host))
    },
  }
}
