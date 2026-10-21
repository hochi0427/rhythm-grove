// Browser-independent transport: tests can provide a mock Serial API.
export function createLineParser(onLine, maxLength = 1024) {
  let pending = '', discarding = false
  return chunk => {
    for (const character of chunk) {
      if (character === '\n') {
        if (!discarding) onLine(pending.trim())
        pending = ''
        discarding = false
      } else if (!discarding) {
        pending += character
        if (pending.length > maxLength) { pending = ''; discarding = true }
      }
    }
  }
}

export function createArduinoSerial({ serial, secureContext = true, onHit, onState, logger = console }) {
  const supported = Boolean(serial && secureContext)
  let active = null, disposed = false
  // Temporary diagnostics: inject a silent logger to disable after hardware testing.
  function log(event, details = {}, level = 'info') {
    logger[level](`[Rhythm Grove][Serial] ${event}`, details)
  }
  function publish(status, message = '') {
    log('Connection status', { status, supported, message })
    if (!disposed) onState({ supported, status, message })
  }
  publish('disconnected', supported ? '' : 'Web Serial needs a supported browser (such as desktop Chrome or Edge) on HTTPS or localhost. Keyboard input still works.')

  async function cleanup(session) {
    if (!session.cleanupTask) {
      session.cleanupTask = (async () => {
        if (session.opened) {
          // A write already in flight must release its lock before port.close().
          // Queued writes see session.stopped and are discarded on disconnect.
          await session.writeTail
          try { await session.port.close() }
          catch (error) {
            log('Port close error', { error }, 'error')
            if (!session.message) session.message = 'Could not close the serial port. Unplug and reconnect the Arduino before retrying.'
          }
        }
        if (active === session) {
          active = null
          publish('disconnected', session.message)
        }
      })()
    }
    await session.cleanupTask
  }

  async function read(session) {
    const decoder = new TextDecoder()
    const parse = createLineParser(line => {
      log('Incoming serial line', { line: JSON.stringify(line) })
      if (line === 'HIT' && !session.stopped) {
        log('Incoming HIT → drum input')
        onHit()
      }
    })
    try {
      session.reader = session.port.readable.getReader()
      while (!session.stopped) {
        const { value, done } = await session.reader.read()
        if (done) {
          if (!session.stopped) session.message = 'Arduino disconnected. Reconnect it or keep playing with your keyboard.'
          break
        }
        if (!session.stopped) parse(decoder.decode(value, { stream: true }))
      }
    } catch (error) {
      log('Serial read error', { error, stopping: session.stopped }, 'error')
      if (!session.stopped) session.message = 'Serial connection lost. Reconnect the Arduino or keep playing with your keyboard.'
    } finally {
      session.stopped = true
      session.reader?.releaseLock()
      session.reader = null
      await cleanup(session)
    }
  }

  function connect() {
    if (!supported || disposed || active) return Promise.resolve()
    const session = { stopped: false, opened: false, message: '', writeTail: Promise.resolve() }
    active = session
    publish('connecting')
    session.connectTask = (async () => {
      try {
        // Must run directly from the Connect button's user gesture.
        session.port = await serial.requestPort()
        log('Selected port', { info: session.port.getInfo?.(), baudRate: 115200 })
        if (session.stopped || disposed) return
        await session.port.open({ baudRate: 115200 })
        session.opened = true
        log('Port opened', { readable: Boolean(session.port.readable), writable: Boolean(session.port.writable), writableLocked: session.port.writable?.locked })
        if (session.stopped || disposed) return
        if (!session.port.readable) throw new Error('No readable stream')
        publish('connected')
        session.readTask = read(session)
      } catch (error) {
        log('Connection error', { error }, 'error')
        if (!session.stopped) {
          session.message = error.name === 'NotFoundError' ? 'No port selected. You can keep playing with your keyboard.'
            : error.name === 'SecurityError' ? 'Serial access was blocked. Open on HTTPS or localhost and allow serial access.'
            : 'Could not connect. Check the USB cable and close Arduino Serial Monitor or other apps using the port, then try again.'
        }
      } finally {
        if (!session.readTask) await cleanup(session)
      }
    })()
    return session.connectTask
  }

  function sendCommand(command, { shouldSend = () => true } = {}) {
    const session = active
    // Capture the current session so old commands cannot reach a reconnected board.
    if (typeof command !== 'string' || !command || /[\r\n]/.test(command)) {
      log('LED command skipped: invalid command', { command }, 'warn')
      return Promise.resolve(false)
    }
    if (disposed || !session?.opened || session.stopped) {
      log('LED command skipped: Arduino disconnected', { command }, 'warn')
      return Promise.resolve(false)
    }
    log('LED command queued', { command, writableLocked: session.port.writable?.locked })
    session.writeTail = session.writeTail.then(async () => {
      if (!shouldSend()) {
        log('LED command skipped: feedback cancelled or expired', { command })
        return false
      }
      if (disposed || active !== session || session.stopped || !session.port.writable) {
        log('LED command skipped: connection stopped or no writable stream', { command }, 'warn')
        return false
      }
      // Never take/release another owner's lock, or permanently disable later commands.
      if (session.port.writable.locked) {
        log('Serial write blocked: writable stream is locked', { command, writableLocked: true }, 'error')
        return false
      }
      let writer
      try {
        writer = session.port.writable.getWriter()
        const payload = `${command}\n`
        const bytes = new TextEncoder().encode(payload)
        log('Outgoing LED command', { payload: JSON.stringify(payload), bytes: Array.from(bytes), writableLocked: session.port.writable.locked })
        await writer.write(bytes)
        log('Serial write succeeded', { payload: JSON.stringify(payload) })
        return true
      } catch (error) {
        // LED failure must not interrupt input, scoring, audio, or animations.
        // Do not retry this judgement, but allow independent future judgements.
        log('Serial write error', { command, error, writableLocked: session.port.writable?.locked }, 'error')
        return false
      } finally {
        writer?.releaseLock()
        log('Writer released', { writableLocked: session.port.writable?.locked })
      }
    }).catch(error => {
      log('Serial write queue error', { command, error }, 'error')
      return false
    })
    return session.writeTail
  }

  function sendJudgement(judgement) {
    const command = { Perfect: 'PERFECT', Good: 'GOOD', Miss: 'MISS' }[judgement]
    log('Judgement received for LED feedback', { judgement, command })
    return command ? sendCommand(command) : Promise.resolve(false)
  }

  async function disconnect() {
    const session = active
    if (!session) return
    session.stopped = true
    publish('disconnecting', session.message)
    if (session.reader) {
      try { await session.reader.cancel() } catch { /* Device may already be gone. */ }
    }
    await session.connectTask
    if (session.readTask) await session.readTask
    else await cleanup(session)
  }

  function onDisconnect(event) {
    if (active && (event.port || event.target) === active.port) {
      active.message = 'Arduino disconnected. Reconnect it or keep playing with your keyboard.'
      void disconnect()
    }
  }
  serial?.addEventListener('disconnect', onDisconnect)
  return {
    connect,
    disconnect,
    sendCommand,
    sendJudgement,
    async dispose() {
      disposed = true
      serial?.removeEventListener('disconnect', onDisconnect)
      await disconnect()
    },
  }
}
