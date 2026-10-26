import { spawnSync } from 'node:child_process'

export function stopTestProcesses(processes) {
  for (const child of [...processes].reverse()) {
    if (process.platform === 'win32' && child.pid && child.exitCode === null) {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else child.kill('SIGTERM')
    child.stdout?.destroy()
    child.stderr?.destroy()
  }
}
