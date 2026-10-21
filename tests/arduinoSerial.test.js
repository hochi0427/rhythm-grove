import test from 'node:test'
import assert from 'node:assert/strict'
import { createArduinoSerial, createLineParser } from '../src/services/arduinoSerial.js'
import { createArduinoFeedback } from '../src/services/arduinoFeedback.js'
import { createEvaluator, levels, patternEvents } from '../src/lib/rhythm.js'

const flush = () => new Promise(resolve => setImmediate(resolve))
const encode = text => new TextEncoder().encode(text)

function fixture(options = {}) {
  const states = [], hits = [], writes = [], logs = []
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
      this.writable = new WritableStream({
        async write(bytes) {
          options.onWrite?.()
          if (options.writeGate) await options.writeGate
          if (options.writeError) throw options.writeError
          writes.push(new TextDecoder().decode(bytes))
        },
      })
    },
    async close() {
      assert.equal(this.readable.locked, false, 'release reader before closing port')
      assert.equal(this.writable.locked, false, 'release writer before closing port')
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
    logger: Object.fromEntries(['info', 'warn', 'error'].map(level => [level, (event, details) => logs.push({ level, event, details })])),
    serial: options.unsupported ? undefined : serial,
    secureContext: options.secureContext ?? true,
    onState: state => states.push(state),
    onHit: () => { hits.push('HIT'); options.onHit?.() },
  })
  return {
    ...transport, port, states, hits, writes, logs,
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

test('judgements serialize exact newline-terminated LED commands on the existing port', async () => {
  let release, writeStarts = 0
  const f = fixture({ writeGate: new Promise(resolve => { release = resolve }), onWrite: () => writeStarts++ })
  await f.connect()
  const pending = ['Perfect', 'Good', 'Miss', 'Perfect'].map(f.sendJudgement)
  await flush()
  assert.equal(writeStarts, 1, 'subsequent commands must wait for the active writer')
  // Reading stays active while a write is pending.
  f.send('HIT\n'); await flush()
  assert.equal(f.hits.length, 1)
  release()
  assert.deepEqual(await Promise.all(pending), [true, true, true, true])
  assert.deepEqual(f.writes, ['PERFECT\n', 'GOOD\n', 'MISS\n', 'PERFECT\n'])
  assert.equal(f.port.writable.locked, false)
  assert.equal(f.counts.requests, 1)
  assert.equal(f.counts.opens, 1)
  await f.dispose()
})

test('disconnect waits for the active write, drops queued commands, and unlocks the port', async () => {
  let release
  const f = fixture({ writeGate: new Promise(resolve => { release = resolve }) })
  await f.connect()
  const first = f.sendJudgement('Perfect')
  const queued = f.sendJudgement('Miss')
  await flush()
  const closing = f.disconnect()
  await flush()
  assert.equal(f.counts.closes, 0, 'port cannot close while the writer is locked')
  assert.equal(await f.sendJudgement('Good'), false)
  release()
  await closing
  assert.equal(await first, true)
  assert.equal(await queued, false)
  assert.deepEqual(f.writes, ['PERFECT\n'])
  assert.equal(f.port.writable.locked, false)
  await f.connect()
  assert.equal(await f.sendJudgement('Good'), true)
  assert.deepEqual(f.writes, ['PERFECT\n', 'GOOD\n'])
  await f.dispose()
})

test('write errors are contained, never retried, and do not stop drum input or scoring', async () => {
  const f = fixture({ writeError: new Error('USB write failed') })
  await f.connect()
  assert.deepEqual(await Promise.all(['Perfect', 'Good', 'Miss'].map(f.sendJudgement)), [false, false, false])
  assert.equal(f.port.writable.locked, false)
  f.send('HIT\n'); await flush()
  assert.equal(f.hits.length, 1)
  const evaluator = createEvaluator([1000], undefined, result => { void f.sendJudgement(result) })
  assert.equal(evaluator.hit(1000), 'Perfect')
  assert.equal(evaluator.accuracy, 100)
  await f.disconnect()
  assert.equal(f.counts.closes, 1)
})

test('disconnected, unsupported, invalid, and read-only sends are harmless no-ops', async () => {
  for (const options of [{}, { unsupported: true }]) {
    const f = fixture(options)
    assert.equal(await f.sendJudgement('Perfect'), false)
    assert.equal(await f.sendCommand('MISS'), false)
    await f.dispose()
  }
  const f = fixture()
  await f.connect()
  assert.equal(await f.sendCommand('PERFECT\nMISS'), false)
  assert.equal(await f.sendCommand('GOOD\r'), false)
  assert.equal(await f.sendJudgement('Unknown'), false)
  f.port.writable = null
  assert.equal(await f.sendJudgement('Miss'), false)
  assert.deepEqual(f.writes, [])
  // Restore a writable stream for the fixture's close assertion.
  f.port.writable = new WritableStream()
  await f.dispose()
  assert.equal(await f.sendJudgement('Perfect'), false)
})

for (const mode of ['follow', 'copy', 'read']) {
  test(`${mode}: HIT is evaluated before LED feedback; missing notes send once each`, async () => {
    let evaluator, now = 0
    const f = fixture({ onHit: () => evaluator?.hit(now) })
    await f.connect()
    // Raw HIT outside a playing round still reaches input, but emits no LED command.
    f.send('HIT\n'); await flush()
    assert.equal(f.hits.length, 1)
    assert.deepEqual(f.writes, [])
    const expected = mode === 'follow' ? [1000, 2000, 3000, 4000, 5000]
      : patternEvents(levels.easy.notes).filter(e => !e.rest).map(e => 1000 + e.beat * 1000)
    const emitted = []
    evaluator = createEvaluator(expected, undefined, result => emitted.push(f.sendJudgement(result)))
    now = expected[0]; f.send('HIT\n'); await flush()
    now = expected[1] + 100; f.send('HIT\n'); await flush()
    now = expected[2] + 150; f.send('HIT\n'); await flush()
    // An extra hit is its own Miss, rather than a duplicate judgement of that note.
    now = expected[2] + 400; f.send('HIT\n'); await flush()
    evaluator.expire(expected.at(-1) + 181)
    const commandCount = emitted.length
    for (let i = 0; i < 5; i++) {
      evaluator.expire(expected.at(-1) + 200 + i)
      void evaluator.results
      void evaluator.accuracy
    }
    assert.equal(emitted.length, commandCount, 'frame updates must not repeat feedback')
    assert.deepEqual(await Promise.all(emitted), Array(commandCount).fill(true))
    assert.deepEqual(f.writes, ['PERFECT\n', 'GOOD\n', 'MISS\n', 'MISS\n', ...expected.slice(3).map(() => 'MISS\n')])
    assert.equal(f.port.writable.locked, false)
    assert.equal(f.counts.requests, 1)
    await f.dispose()
  })
}

test('unplugging during a failed write releases both locks and discards queued feedback', async () => {
  let rejectWrite
  const f = fixture({ writeGate: new Promise((resolve, reject) => { rejectWrite = reject }) })
  await f.connect()
  const pending = [f.sendJudgement('Perfect'), f.sendJudgement('Miss')]
  await flush()
  f.unplug()
  await flush()
  assert.equal(f.counts.closes, 0)
  rejectWrite(new Error('USB device removed during write'))
  await f.disconnect()
  assert.deepEqual(await Promise.all(pending), [false, false])
  assert.equal(f.port.readable.locked, false)
  assert.equal(f.port.writable.locked, false)
  assert.equal(f.state.status, 'disconnected')
  assert.equal(f.counts.closes, 1)
  assert.deepEqual(f.writes, [])
})

test('a temporary external writer lock does not disable all subsequent LED feedback', async () => {
  const f = fixture()
  await f.connect()
  const externalWriter = f.port.writable.getWriter()
  assert.equal(await f.sendJudgement('Perfect'), false)
  assert.ok(f.logs.some(log => log.level === 'error' && log.event.includes('writable stream is locked') && log.details.writableLocked))
  externalWriter.releaseLock()
  assert.equal(await f.sendJudgement('Good'), true, 'a later judgement must work after the lock is released')
  assert.deepEqual(f.writes, ['GOOD\n'])
  await f.dispose()
})

test('diagnostics show connection, incoming HIT, exact encoded LED bytes, and unlocked completion', async () => {
  const f = fixture()
  await f.connect()
  f.send('HIT\n'); await flush()
  await f.sendJudgement('Perfect')
  await f.sendJudgement('Good')
  await f.sendJudgement('Miss')
  assert.ok(f.logs.some(log => log.event.includes('Connection status') && log.details.status === 'connected'))
  assert.ok(f.logs.some(log => log.event.includes('Incoming HIT')))
  assert.ok(f.logs.some(log => log.event.includes('Judgement received') && log.details.judgement === 'Perfect'))
  const outgoing = f.logs.filter(log => log.event.endsWith('Outgoing LED command'))
  assert.deepEqual(outgoing.map(log => log.details.payload), ['"PERFECT\\n"', '"GOOD\\n"', '"MISS\\n"'])
  assert.deepEqual(outgoing.map(log => log.details.bytes), [
    [80, 69, 82, 70, 69, 67, 84, 10],
    [71, 79, 79, 68, 10],
    [77, 73, 83, 83, 10],
  ])
  assert.equal(f.port.writable.locked, false)
  assert.ok(f.logs.some(log => log.event.includes('Writer released') && log.details.writableLocked === false))
  await f.dispose()
})

test('write exceptions are logged and a recovered writable stream can send the next judgement', async () => {
  const failure = new Error('Temporary serial write error')
  const f = fixture({ writeError: failure })
  await f.connect()
  assert.equal(await f.sendJudgement('Perfect'), false)
  assert.ok(f.logs.some(log => log.level === 'error' && log.event.includes('Serial write error') && log.details.error === failure))
  assert.equal(f.port.writable.locked, false)
  f.port.writable = new WritableStream({ write(bytes) { f.writes.push(new TextDecoder().decode(bytes)) } })
  assert.equal(await f.sendJudgement('Good'), true)
  assert.deepEqual(f.writes, ['GOOD\n'])
  await f.dispose()
})

test('each physical free-play HIT produces one PURPLE command on the existing connection', async () => {
  const inputs = []
  const input = { practiceActive: false, emitHit: (...args) => inputs.push(args) }
  let feedback
  const f = fixture({ onHit: () => feedback.handleHit() })
  feedback = createArduinoFeedback({ input, sendCommand: f.sendCommand, now: () => 1234 })
  await f.connect()
  f.send('HI'); await flush()
  assert.deepEqual(f.writes, [])
  f.send('T\nHIT\r\nHIT\n'); await flush()
  assert.deepEqual(f.writes, ['PURPLE\n', 'PURPLE\n', 'PURPLE\n'])
  assert.deepEqual(inputs, Array.from({ length: 3 }, () => ['arduino', 1234]))
  assert.equal(f.counts.requests, 1)
  assert.equal(f.counts.opens, 1)
  await f.dispose()
})

for (const mode of ['follow', 'copy', 'read']) {
  test(`${mode}: physical hits get judgements in play and purple only after the round ends`, async () => {
    let phase = 'countin', feedback, now = 1000
    const input = { practiceActive: true, emitHit: () => { if (phase === 'playing') evaluator.hit(now) } }
    const f = fixture({ onHit: () => feedback.handleHit() })
    const evaluator = createEvaluator([1000, 2000, 3000, 4000], undefined, result => { void f.sendJudgement(result) })
    feedback = createArduinoFeedback({ input, sendCommand: f.sendCommand, now: () => now })
    await f.connect()
    for (const waitingPhase of ['countin', 'listening', 'ready']) {
      phase = waitingPhase
      f.send('HIT\n'); await flush()
    }
    assert.deepEqual(f.writes, [], 'round/countdown hits must not masquerade as free play')
    phase = 'playing'
    for (const time of [1000, 2100, 3150]) {
      now = time
      f.send('HIT\n'); await flush()
    }
    evaluator.expire(5000); await flush()
    assert.deepEqual(f.writes, ['PERFECT\n', 'GOOD\n', 'MISS\n', 'MISS\n'])
    phase = 'done'; input.practiceActive = false
    f.send('HIT\n'); await flush()
    assert.deepEqual(f.writes, ['PERFECT\n', 'GOOD\n', 'MISS\n', 'MISS\n', 'PURPLE\n'])
    await f.dispose()
  })
}

test('queued countdown flashes are discarded on cancellation/completion and replay can flash', async () => {
  let release, current = true
  const f = fixture({ writeGate: new Promise(resolve => { release = resolve }) })
  await f.connect()
  const feedback = createArduinoFeedback({ input: { practiceActive: true }, sendCommand: f.sendCommand })
  const blocker = f.sendJudgement('Perfect')
  await flush()
  const cancelled = feedback.countdownBeat(() => current)
  current = false
  release()
  await blocker
  assert.equal(await cancelled, false)
  assert.deepEqual(f.writes, ['PERFECT\n'])
  assert.equal(await feedback.countdownBeat(() => false), false)
  assert.equal(await feedback.countdownBeat(() => true), true)
  assert.deepEqual(f.writes, ['PERFECT\n', 'PURPLE\n'])
  await f.dispose()
})

test('free-play and countdown commands are safe when disconnected', async () => {
  const f = fixture()
  let hits = 0
  const feedback = createArduinoFeedback({ input: { practiceActive: false, emitHit() { hits++ } }, sendCommand: f.sendCommand })
  feedback.handleHit()
  assert.equal(hits, 1)
  assert.equal(await feedback.countdownBeat(() => true), false)
  assert.deepEqual(f.writes, [])
  await f.dispose()
})
