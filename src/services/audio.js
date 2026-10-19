let context
const voices = new Set()
export function unlockAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return
  context ||= new AudioContext()
  return context.resume()
}
export function playDrum(delay = 0, soft = false) {
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
  oscillator.stop(time + .24)
  voices.add(oscillator)
  oscillator.onended = () => voices.delete(oscillator)
}
export function cancelScheduledAudio() {
  for (const voice of voices) { try { voice.stop() } catch {} }
  voices.clear()
}
