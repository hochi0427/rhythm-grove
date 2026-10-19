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

export function createArduinoSerial({ serial, secureContext = true, onHit, onState }) {
  const supported = Boolean(serial && secureContext)
  let active = null, disposed = false
  function publish(status, message = '') {
    if (!disposed) onState({ supported, status, message })
  }
  publish('disconnected', supported ? '' : 'Web Serial needs a supported browser (such as desktop Chrome or Edge) on HTTPS or localhost. Keyboard input still works.')

  async function cleanup(session) {
    if (!session.cleanupTask) {
      session.cleanupTask = (async () => {
        if (session.opened) {
          try { await session.port.close() }
          catch { if (!session.message) session.message = 'Could not close the serial port. Unplug and reconnect the Arduino before retrying.' }
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
      if (line === 'HIT' && !session.stopped) onHit()
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
    } catch {
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
    const session = { stopped: false, opened: false, message: '' }
    active = session
    publish('connecting')
    session.connectTask = (async () => {
      try {
        // Must run directly from the Connect button's user gesture.
        session.port = await serial.requestPort()
        if (session.stopped || disposed) return
        await session.port.open({ baudRate: 115200 })
        session.opened = true
        if (session.stopped || disposed) return
        if (!session.port.readable) throw new Error('No readable stream')
        publish('connected')
        session.readTask = read(session)
      } catch (error) {
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
    async dispose() {
      disposed = true
      serial?.removeEventListener('disconnect', onDisconnect)
      await disconnect()
    },
  }
}
