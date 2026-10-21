import test from 'node:test'
import assert from 'node:assert/strict'
import { beautyAndABeat, songBeats } from '../src/lib/music.js'
import { createMusicTransport } from '../src/services/musicTransport.js'
import { createEvaluator } from '../src/lib/rhythm.js'

function fixture() {
  const sources = [], cues = []
  const parameter = () => ({ value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} })
  const node = () => ({ connect(target) { return target }, disconnect() {}, stop() { this.stopped = true } })
  const context = {
    currentTime: 5, state: 'running', destination: {},
    output: { contextTime: 4.9, performanceTime: 1000 },
    getOutputTimestamp() { return this.output },
    createGain() { return { ...node(), gain: parameter() } },
    createBufferSource() {
      const source = { ...node(), start(time) { this.started = time } }
      sources.push(source); return source
    },
    createOscillator() {
      const oscillator = { ...node(), frequency: parameter(), start(time) { this.started = time } }
      cues.push(oscillator); return oscillator
    },
  }
  const transport = createMusicTransport(context, { now: () => 1000 })
  const beats = songBeats(beautyAndABeat, 228.023)
  const start = (guide = true) => transport.start({ duration: 228.023 }, { beats, bpm: 128, guide })
  const at = time => { context.output = { contextTime: time, performanceTime: 1000 }; context.currentTime = time + .1 }
  return { context, transport, sources, cues, beats, start, at }
}

test('full song has 480 fixed-time pulses and no targets in the silent ending', () => {
  const beats = songBeats(beautyAndABeat, 228.023)
  assert.equal(beats.length, 480)
  assert.equal(beats[0], .03)
  assert.ok(Math.abs(beats.at(-1) - 224.56125) < 1e-9)
  for (let i = 1; i < beats.length; i++) assert.ok(Math.abs(beats[i] - beats[i - 1] - .46875) < 1e-9)
  assert.equal(songBeats(beautyAndABeat, 228.023, 100)[100], beats[100] + .1)
  assert.deepEqual(songBeats(beautyAndABeat, 228.023, 10000), songBeats(beautyAndABeat, 228.023, 250))
})

test('song, guide and countdown share absolute audio times through the last beat', () => {
  const f = fixture(), timing = f.start()
  assert.equal(f.sources.length, 1)
  assert.equal(f.sources[0].started, timing.songStart)
  assert.equal(f.cues.length, 484)
  assert.ok(Math.abs(f.cues[4].started - f.cues[0].started - 4 * .46875) < 1e-9)
  f.beats.forEach((beat, i) => assert.equal(f.cues[i + 4].started, timing.songStart + beat))
  let flashes = 0
  for (const cue of f.cues) { f.at(cue.started); f.transport.pump(() => flashes++); f.transport.pump(() => flashes++) }
  assert.equal(flashes, 484, 'one callback per scheduled pulse, never duplicate')
})

test('guide muted still flashes all four count-ins and song beats', () => {
  const f = fixture(), timing = f.start(false)
  assert.equal(f.cues.length, 4)
  const events = []
  for (let i = 0; i < 4; i++) { f.at(timing.countStart + i * .46875); f.transport.pump(e => events.push(e)) }
  for (const beat of f.beats) { f.at(timing.songStart + beat); f.transport.pump(e => events.push(e)) }
  assert.equal(events.filter(e => e.countin).length, 4)
  assert.equal(events.filter(e => !e.countin).length, 480)
})

test('scoring uses the audible clock and timestamped hits, not rendering lead time', () => {
  const f = fixture(), { songStart } = f.start()
  const evaluator = createEvaluator(f.beats.map(t => t * 1000))
  f.at(songStart + f.beats[10])
  assert.equal(evaluator.hit(f.transport.position(1000) * 1000), 'Perfect')
  assert.ok(Math.abs(f.transport.position(1100) - f.beats[10] - .1) < 1e-9)
  // Sample long after playback starts: the song and scoring have not accumulated drift.
  f.at(songStart + f.beats[479])
  assert.equal(evaluator.hit(f.transport.position(1000) * 1000), 'Perfect')
})

test('late frames drop stale LEDs; cancel and restart invalidate queued writer guards', () => {
  const f = fixture(), { songStart } = f.start()
  const delivered = []
  f.at(songStart + f.beats[100]); f.transport.pump(e => delivered.push(e))
  assert.equal(delivered.length, 1)
  const guard = delivered[0].shouldSend
  assert.equal(guard(), true)
  f.transport.stop()
  assert.equal(guard(), false)
  assert.equal(f.sources[0].stopped, true)
  f.start()
  assert.equal(guard(), false)
  assert.equal(f.sources.length, 2)
})

test('output timestamp fallback accounts for output latency, and suspension emits nothing', () => {
  const f = fixture(), { songStart } = f.start()
  f.context.getOutputTimestamp = undefined; f.context.outputLatency = .08
  f.context.currentTime = songStart + 20.08
  assert.ok(Math.abs(f.transport.position() - 20) < 1e-9)
  f.context.state = 'suspended'
  let flashed = false; f.transport.pump(() => { flashed = true })
  assert.equal(flashed, false)
})
