let context
const voices = new Set()
const beatEvents = new Set()
export function unlockAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return
  context ||= new AudioContext()
  return context.resume()
}
export function playDrum(delay = 0, soft = false, { onBeat, expiresAfter = Infinity } = {}) {
  if (!context || context.state !== 'running') return
  const time = context.currentTime + Math.max(0, delay)
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.frequency.setValueAtTime(soft ? 420 : 155, time)
  oscillator.frequency.exponentialRampToValueAtTime(soft ? 240 : 45, time + .13)
  gain.gain.setValueAtTime(soft ? .12 : .65, time)
  gain.gain.exponentialRampToValueAtTime(.001, time + .22)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start(time)
  // Use the exact AudioContext timestamp passed to oscillator.start().
  if (onBeat) beatEvents.add({ time, expiresAt: time + expiresAfter, onBeat })
  oscillator.stop(time + .24)
  voices.add(oscillator)
  oscillator.onended = () => voices.delete(oscillator)
}
// Called by the game's existing animation loop, never by an independent LED timer.
export function dispatchAudioBeats() {
  if (!context || context.state !== 'running') return
  for (const event of beatEvents) {
    if (context.currentTime < event.time) continue
    beatEvents.delete(event)
    // Skip stale beats after a suspended/throttled frame instead of flashing a burst.
    if (context.currentTime < event.expiresAt) event.onBeat()
  }
}
export function cancelScheduledAudio() {
  beatEvents.clear()
  for (const voice of voices) { try { voice.stop() } catch {} }
  voices.clear()
}
