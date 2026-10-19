import test from 'node:test'
import assert from 'node:assert/strict'
import { createArduinoSerial, createLineParser } from '../src/services/arduinoSerial.js'

const flush = () => new Promise(resolve => setImmediate(resolve))
const encode = text => new TextEncoder().encode(text)

function fixture(options = {}) {
  const states = [], hits = []
  let controller, requests = 0, opens = 0, closes = 0, cancelled = 0
  const port = {
    async open(config) {
      opens++
      assert.deepEqual(config, { baudRate: 115200 })
      if (options.openError) throw options.openError
      if (options.openGate) await options.openGate
      this.readable = new ReadableStream({
        start(stream) { controller = stream },
        cancel() { cancelled++ },
      })
    },
    async close() {
      assert.equal(this.readable.locked, false, 'release reader before closing port')
      closes++
      if (options.closeError) throw options.closeError
    },
  }
  const serial = new EventTarget()
  serial.requestPort = async () => {
    requests++
    if (options.requestError) throw options.requestError
    if (options.requestGate) await options.requestGate
    return port
  }
  const transport = createArduinoSerial({
    serial: options.unsupported ? undefined : serial,
    secureContext: options.secureContext ?? true,
    onState: state => states.push(state),
    onHit: () => hits.push('HIT'),
  })
  return {
    ...transport, port, states, hits,
    send(text) { controller.enqueue(encode(text)) },
    end() { controller.close() },
    fail() { controller.error(new Error('Device removed')) },
    unplug(target = port) { const event = new Event('disconnect'); Object.defineProperty(event, 'port', { value: target }); serial.dispatchEvent(event) },
    get state() { return states.at(-1) },
    get counts() { return { requests, opens, closes, cancelled } },
  }
}

test('line parser handles chunks, CRLF, multiple lines, and oversized lines', () => {
  const lines = [], parse = createLineParser(line => lines.push(line), 8)
  parse('HI'); parse('T\r'); parse('\nHIT\nready\n\n')
  parse('0123456789HIT\nHIT\n')
  assert.deepEqual(lines, ['HIT', 'HIT', 'ready', '', 'HIT'])
})

test('serial opens at 115200 and emits only complete HIT commands', async () => {
  const f = fixture()
  await f.connect()
  assert.equal(f.state.status, 'connected')
  f.send('HI'); await flush()
  assert.equal(f.hits.length, 0)
  f.send('T\r\nHIT\nBOOT\nhit\nHIT-extra\nHI'); await flush()
  assert.equal(f.hits.length, 2)
  f.send('T\n'); await flush()
  assert.equal(f.hits.length, 3)
  await f.disconnect()
  assert.equal(f.state.status, 'disconnected')
  assert.deepEqual(f.counts, { requests: 1, opens: 1, closes: 1, cancelled: 1 })
})

test('manual disconnect cancels blocked reading, unlocks, and supports reconnect', async () => {
  const f = fixture()
  await f.connect()
  f.send('HI'); await flush()
  await Promise.all([f.disconnect(), f.disconnect()])
  assert.equal(f.state.message, '')
  await f.connect()
  f.send('T\n'); await flush()
  assert.equal(f.hits.length, 0, 'old partial lines must not carry over')
  f.send('HIT\n'); await flush()
  assert.equal(f.hits.length, 1)
  await f.dispose()
  assert.deepEqual(f.counts, { requests: 2, opens: 2, closes: 2, cancelled: 2 })
})

test('unexpected USB disconnect returns to keyboard fallback and allows reconnect', async () => {
  const f = fixture()
  await f.connect()
  f.unplug({ unrelated: true }); await flush()
  assert.equal(f.state.status, 'connected')
  f.unplug(); await flush()
  assert.equal(f.state.status, 'disconnected')
  assert.match(f.state.message, /disconnected/)
  assert.equal(f.counts.closes, 1)
  await f.connect()
  f.send('HIT\n'); await flush()
  assert.equal(f.hits.length, 1)
  await f.dispose()
})

test('stream failures and unexpected EOF clean up without an unhandled rejection', async () => {
  for (const end of ['fail', 'end']) {
    const f = fixture()
    await f.connect()
    f[end](); await flush()
    assert.equal(f.state.status, 'disconnected')
    assert.match(f.state.message, /keyboard/)
    assert.equal(f.counts.closes, 1)
    await f.dispose()
  }
})

test('cancelled chooser, blocked permission, and busy ports report helpful errors', async () => {
  for (const [option, name, message] of [
    ['requestError', 'NotFoundError', /No port selected/],
    ['requestError', 'SecurityError', /blocked/],
    ['openError', 'NetworkError', /Serial Monitor/],
  ]) {
    const error = new Error('Failed'); error.name = name
    const f = fixture({ [option]: error })
    await f.connect()
    assert.equal(f.state.status, 'disconnected')
    assert.match(f.state.message, message)
    assert.equal(f.counts.closes, 0)
    await f.dispose()
  }
})

test('unsupported browser or insecure context never requests a port', async () => {
  for (const option of [{ unsupported: true }, { secureContext: false }]) {
    const f = fixture(option)
    await f.connect()
    assert.equal(f.state.supported, false)
    assert.match(f.state.message, /HTTPS or localhost/)
    assert.equal(f.counts.requests, 0)
    await f.dispose()
  }
})

test('repeated connect clicks cannot open competing readers', async () => {
  const f = fixture()
  await Promise.all([f.connect(), f.connect(), f.connect()])
  assert.equal(f.counts.requests, 1)
  await f.dispose()
})

test('unmount during port selection or opening closes any late-opened port', async () => {
  for (const gate of ['requestGate', 'openGate']) {
    let release
    const f = fixture({ [gate]: new Promise(resolve => { release = resolve }) })
    const opening = f.connect()
    await flush()
    const disposing = f.dispose()
    release()
    await Promise.all([opening, disposing])
    assert.equal(f.counts.closes, gate === 'openGate' ? 1 : 0)
    const stateCount = f.states.length
    await f.connect()
    f.unplug()
    await flush()
    assert.equal(f.states.length, stateCount, 'disposed adapter must not publish state')
    assert.equal(f.counts.requests, 1)
  }
})

test('a failed port close reports a recovery path', async () => {
  const f = fixture({ closeError: new Error('Device gone') })
  await f.connect()
  await f.disconnect()
  assert.equal(f.state.status, 'disconnected')
  assert.match(f.state.message, /Unplug and reconnect/)
  await f.dispose()
})
