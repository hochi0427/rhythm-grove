// The audio clock owns playback. Animation frames only read it and deliver due LEDs.
// Each transport owns its voices, so stopping Music cannot leave an old song playing.
export function createMusicTransport(context, { now = () => performance.now() } = {}) {
  let source, songGain, guideGain, songStart = 0, duration = 0, running = false
  let queue = [], next = 0, generation = 0
  const cues = new Set()

  function audibleTime(timestamp = now()) {
    const output = context.getOutputTimestamp?.()
    if (output && output.performanceTime > 0 && Number.isFinite(output.contextTime)) {
      return output.contextTime + (timestamp - output.performanceTime) / 1000
    }
    // Fallback for browsers without output timestamps. Hardware calibration may help.
    const latency = context.outputLatency || context.baseLatency || 0
    return context.currentTime - latency + (timestamp - now()) / 1000
  }
  function cue(time, accent) {
    const oscillator = context.createOscillator(), gain = context.createGain()
    oscillator.frequency.setValueAtTime(accent ? 720 : 480, time)
    gain.gain.setValueAtTime(.10, time)
    gain.gain.exponentialRampToValueAtTime(.001, time + .045)
    oscillator.connect(gain).connect(guideGain)
    oscillator.start(time); oscillator.stop(time + .05)
    cues.add(oscillator)
    oscillator.onended = () => { cues.delete(oscillator); oscillator.disconnect(); gain.disconnect() }
  }
  function stop() {
    generation++; running = false; queue = []; next = 0
    if (source) { try { source.stop() } catch {} source.disconnect(); source = undefined }
    for (const voice of cues) { try { voice.stop() } catch {} }
    cues.clear()
    songGain?.disconnect(); guideGain?.disconnect()
  }
  function start(buffer, { beats, bpm, volume = .65, guide = true }) {
    stop()
    if (!beats.length || context.state !== 'running') throw new Error('Audio is not ready. Please try again.')
    duration = buffer.duration
    const interval = 60 / bpm
    // Leave sufficient time to schedule before the first countdown cue.
    const countStart = context.currentTime + .15
    songStart = countStart + 4 * interval - beats[0]
    songGain = context.createGain(); songGain.gain.value = volume; songGain.connect(context.destination)
    guideGain = context.createGain(); guideGain.connect(context.destination)
    source = context.createBufferSource(); source.buffer = buffer
    source.connect(songGain); source.start(songStart)
    const countdown = Array.from({ length: 4 }, (_, index) => ({ time: countStart + index * interval, index, countin: true }))
    const playing = beats.map((time, index) => ({ time: songStart + time, index, countin: false }))
    queue = [...countdown, ...playing]
    // Schedule sound independently of frame delivery; no setInterval drift.
    countdown.forEach(event => cue(event.time, event.index === 0))
    if (guide) playing.forEach(event => cue(event.time, event.index % 4 === 0))
    running = true
    return { songStart, countStart, duration }
  }
  return {
    start, stop,
    get active() { return running },
    position(timestamp) { return audibleTime(timestamp) - songStart },
    setVolume(value) { if (songGain) songGain.gain.value = Math.max(0, Math.min(1, value)) },
    pump(onBeat) {
      if (!running || context.state !== 'running') return
      const time = audibleTime()
      const token = generation
      while (next < queue.length && queue[next].time <= time) {
        const event = queue[next++]
        // Drop late frames, and recheck at the serial writer to avoid stale flash bursts.
        const valid = () => running && token === generation && context.state === 'running' && audibleTime() < event.time + .10
        if (valid()) onBeat({ ...event, shouldSend: valid })
      }
    },
  }
}
