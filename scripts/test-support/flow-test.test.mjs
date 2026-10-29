import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import test from 'node:test'
import { createFlowTest, requireFreePort } from './flow-test.mjs'

test('porta ocupada é recusada sem encerrar o processo existente', async () => {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    await assert.rejects(requireFreePort(port), /Porta .* indisponível: EADDRINUSE/)
    assert.equal(server.listening, true)
  } finally { await new Promise((resolve) => server.close(resolve)) }
  await requireFreePort(port)
})

test('timeout preserva última causa e diagnóstico remove credenciais', async () => {
  const flow = createFlowTest('diagnostic', { timeout: 20 })
  const messages = []
  const previous = console.error
  console.error = (message) => messages.push(message)
  try {
    await assert.rejects(flow.until(() => { throw new Error('causa original') }, 'etapa de teste'), /etapa de teste.*causa original/)
    await flow.reportFailure(new Error(`password=${flow.password} X-Bootstrap-Token: ${flow.token} csrf_token="csrf-secreto" Cookie: sessao-secreta`))
    const output = messages.join('\n')
    for (const secret of [flow.password, flow.token, 'csrf-secreto', 'sessao-secreta']) assert(!output.includes(secret))
    assert(output.includes('[redigido]'))
  } finally { console.error = previous; await flow.close() }
})

test('falha de subprocesso é imediata e libera recursos para próxima execução', async () => {
  const previous = process.env.NABARBEARIA_TEST_BACKEND
  process.env.NABARBEARIA_TEST_BACKEND = 'na-backend-inexistente-para-teste'
  const flow = createFlowTest('missing-backend')
  const started = Date.now()
  try {
    await assert.rejects(flow.startBackend(), /Não foi possível iniciar.*ENOENT/)
    assert(Date.now() - started < 5000)
  } finally {
    await flow.close()
    if (previous === undefined) delete process.env.NABARBEARIA_TEST_BACKEND
    else process.env.NABARBEARIA_TEST_BACKEND = previous
  }
  await requireFreePort(3011)
  await requireFreePort(9224)
})

test('falha do Chrome encerra API própria e permite nova execução', { skip: !process.env.NABARBEARIA_TEST_BACKEND }, async () => {
  const previous = process.env.CHROME_BIN
  const failed = createFlowTest('failed-chrome')
  process.env.CHROME_BIN = 'na-chrome-inexistente-para-teste'
  try {
    await failed.startBackend()
    await assert.rejects(failed.startBrowser(), /Não foi possível iniciar.*ENOENT/)
  } finally {
    await failed.close()
    if (previous === undefined) delete process.env.CHROME_BIN
    else process.env.CHROME_BIN = previous
  }
  await requireFreePort(3011)
  await requireFreePort(9224)
  const next = createFlowTest('recovered-backend')
  try { await next.startBackend() } finally { await next.close() }
  await requireFreePort(3011)
})
