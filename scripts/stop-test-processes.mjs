import { spawnSync } from 'node:child_process'

function waitForExit(child, timeout) {
  if (!child.pid || child.exitCode !== null || child.signalCode != null) return Promise.resolve(true)
  return new Promise((resolve) => {
    const exited = () => { clearTimeout(timer); resolve(true) }
    const timer = setTimeout(() => { child.removeListener('exit', exited); resolve(false) }, timeout)
    child.once('exit', exited)
  })
}

export async function stopTestProcesses(processes) {
  const errors = []
  for (const child of [...processes].reverse()) {
    try {
      if (process.platform === 'win32' && child.pid && child.exitCode === null) {
        const result = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { encoding: 'utf8', windowsHide: true })
        if (result.error) throw result.error
        if (result.status !== 0) child.kill('SIGTERM')
      } else if (child.testProcessGroup && child.pid) {
        try { process.kill(-child.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
      } else child.kill('SIGTERM')
      if (!await waitForExit(child, 3000)) {
        if (child.testProcessGroup) {
          try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
        } else child.kill('SIGKILL')
        if (!await waitForExit(child, 1000)) throw new Error('Processo não confirmou encerramento')
      }
    } catch (error) { errors.push(new Error(`Falha ao limpar processo próprio ${child.pid ?? 'não iniciado'}: ${error.message}`, { cause: error })) }
    finally { child.stdout?.destroy(); child.stderr?.destroy() }
  }
  if (errors.length) throw new AggregateError(errors, 'Falha na limpeza dos processos de teste')
}
