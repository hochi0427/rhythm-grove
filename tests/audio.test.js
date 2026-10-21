import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { unlockAudio, playDrum, dispatchAudioBeats, cancelScheduledAudio } from '../src/services/audio.js'

const starts = []
const parameter = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} })
const context = {
  currentTime: 0, state: 'running', destination: {},
  async resume() { this.state = 'running' },
  createOscillator() {
    return { frequency: parameter(), connect(node) { return node }, start(time) { starts.push(time) }, stop() {} }
  },
  createGain() { return { gain: parameter(), connect(node) { return node } } },
}
globalThis.window = { AudioContext: function () { return context } }
beforeEach(async () => {
  cancelScheduledAudio()
  context.currentTime = 0
  context.state = 'running'
  starts.length = 0
  await unlockAudio()
})

function countIn(start, interval, onBeat) {
  for (let i = 0; i < 4; i++) playDrum(start + i * interval, true, { onBeat, expiresAfter: interval })
}

test('countdown callbacks use oscillator start times and fire once on the audio clock', () => {
  const flashes = []
  countIn(.12, .75, () => flashes.push(context.currentTime))
  assert.equal(flashes.length, 0, 'scheduling ahead must not send all LED commands immediately')
  for (const time of starts) {
    context.currentTime = time - .001
    dispatchAudioBeats()
    const before = flashes.length
    context.currentTime = time
    dispatchAudioBeats()
    dispatchAudioBeats()
    assert.equal(flashes.length, before + 1)
  }
  assert.deepEqual(flashes, starts)
  context.currentTime = 100
  dispatchAudioBeats()
  assert.equal(flashes.length, 4)
})

test('cancel removes future countdown callbacks and replay gets a fresh countdown', () => {
  let old = 0, replay = 0
  countIn(.12, 1, () => old++)
  context.currentTime = .12
  dispatchAudioBeats()
  assert.equal(old, 1)
  cancelScheduledAudio()
  context.currentTime = 10
  dispatchAudioBeats()
  assert.equal(old, 1)
  countIn(.12, 1, () => replay++)
  context.currentTime = 10.12
  dispatchAudioBeats()
  assert.equal(replay, 1)
  assert.equal(old, 1)
})

test('copy mode can schedule both count-ins without lighting demonstration or gameplay sounds', () => {
  const flashes = []
  const interval = .8
  countIn(.12, interval, () => flashes.push(context.currentTime))
  for (let i = 0; i < 8; i++) playDrum(.12 + (4 + i) * interval)
  countIn(.12 + 12 * interval, interval, () => flashes.push(context.currentTime))
  for (let i = 0; i < 8; i++) playDrum(.12 + (16 + i) * interval, true)
  for (const time of [...starts].sort((a, b) => a - b)) {
    context.currentTime = time
    dispatchAudioBeats()
  }
  assert.equal(flashes.length, 8)
  const expected = [0, 1, 2, 3, 12, 13, 14, 15].map(i => .12 + i * interval)
  flashes.forEach((time, i) => assert.ok(Math.abs(time - expected[i]) < 1e-9))
})

test('completed countdown beats do not flash in a burst after a late frame', () => {
  let flashes = 0
  countIn(.12, .75, () => flashes++)
  context.currentTime = 4
  dispatchAudioBeats()
  assert.equal(flashes, 0)
})

test('suspended audio does not dispatch purple before the audio clock resumes', () => {
  let flashes = 0
  countIn(.12, 1, () => flashes++)
  context.currentTime = .12
  context.state = 'suspended'
  dispatchAudioBeats()
  assert.equal(flashes, 0)
  context.state = 'running'
  dispatchAudioBeats()
  assert.equal(flashes, 1)
})
