<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import DrumIllustration from './DrumIllustration.vue'
import { beautyAndABeat as song, songBeats, formatTime } from '../lib/music'
import { createEvaluator } from '../lib/rhythm'
import { unlockAudio, getAudioContext } from '../services/audio'
import { createMusicTransport } from '../services/musicTransport'
import { drumInput } from '../services/drumInput'

defineProps({ hit: Boolean })
const emit = defineEmits(['back', 'hit', 'complete', 'beat'])
const phase = ref('idle'), error = ref(''), volume = ref(65), guide = ref(true), offset = ref(0)
const accuracy = ref(0), feedback = ref(''), elapsed = ref(0), duration = ref(228), activeBeat = ref(-1), countdown = ref(4)
const counts = ref({ Perfect: 0, Good: 0, Miss: 0 })
const busy = computed(() => ['loading', 'countin', 'playing'].includes(phase.value))
const progress = computed(() => Math.min(100, Math.max(0, elapsed.value / duration.value * 100)))
let buffer, transport, evaluator, frame, controller, generation = 0, beats = [], pulseUntil = -1
const instructions = computed(() => ({
  idle: 'One song. Find the pulse, then make it yours.', loading: 'Getting your song ready…',
  countin: 'Find the pulse. The song starts in…', playing: 'Play with the song. Follow each purple pulse.',
  done: 'Song complete. That was your groove!', stopped: 'Take a breath. Start again whenever you’re ready.',
})[phase.value])

function stop(nextPhase = 'stopped') {
  generation++; controller?.abort(); controller = undefined
  cancelAnimationFrame(frame); transport?.stop(); drumInput.practiceActive = false
  phase.value = nextPhase; activeBeat.value = -1
}
watch(volume, value => transport?.setVolume(value / 100))
const unsubscribe = drumInput.subscribe(({ timestamp }) => {
  if (phase.value !== 'playing' && phase.value !== 'countin') return
  const position = transport.position(timestamp)
  // Judge on the output audio clock, including hits just before the first note.
  if (position < Math.max(0, beats[0] - .18) || position > beats.at(-1) + .18) return
  feedback.value = evaluator.hit(position * 1000)
  accuracy.value = evaluator.accuracy
})

async function start() {
  stop('loading')
  error.value = ''; elapsed.value = 0; accuracy.value = 0; feedback.value = ''
  counts.value = { Perfect: 0, Good: 0, Miss: 0 }; countdown.value = 4
  const token = generation
  drumInput.practiceActive = true
  let timeout
  try {
    await unlockAudio()
    if (token !== generation) return
    const context = getAudioContext()
    if (!context) throw new Error('This browser does not support audio playback.')
    if (!buffer) {
      controller = new AbortController()
      timeout = setTimeout(() => controller?.abort(), 30000)
      const response = await fetch(`${import.meta.env.BASE_URL}${song.file}`, { signal: controller.signal })
      if (!response.ok) throw new Error('The song could not load. Check your connection and try again.')
      const decoded = await context.decodeAudioData(await response.arrayBuffer())
      if (token !== generation) return
      buffer = decoded
    }
    clearTimeout(timeout); controller = undefined
    if (token !== generation) return
    beats = songBeats(song, buffer.duration, Number(offset.value) || 0)
    evaluator = createEvaluator(beats.map(time => time * 1000), undefined, result => { counts.value[result]++ })
    transport = createMusicTransport(context)
    transport.start(buffer, { beats, bpm: song.bpm, volume: volume.value / 100, guide: guide.value })
    duration.value = buffer.duration; phase.value = 'countin'; pulseUntil = -1
    function tick() {
      if (token !== generation) return
      if (context.state !== 'running') {
        stop(); error.value = 'Audio was interrupted. Start again to keep the song and beats together.'; return
      }
      const position = transport.position()
      elapsed.value = Math.max(0, Math.min(duration.value, position))
      phase.value = position < beats[0] ? 'countin' : 'playing'
      countdown.value = Math.max(1, Math.min(4, Math.ceil((beats[0] - position) / (60 / song.bpm))))
      transport.pump(event => {
        activeBeat.value = event.index % 4
        pulseUntil = position + .12
        emit('beat', event.shouldSend)
      })
      if (position > pulseUntil) activeBeat.value = -1
      if (position >= 0) {
        if (evaluator.expire(position * 1000)) feedback.value = 'Miss'
        accuracy.value = evaluator.accuracy
      }
      if (position >= duration.value) {
        const result = { mode: 'music', accuracy: accuracy.value, seconds: Math.round(duration.value) }
        stop('done'); elapsed.value = duration.value; emit('complete', result); return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
  } catch (cause) {
    if (token !== generation) return
    stop('idle')
    error.value = cause.name === 'AbortError' ? 'Loading took too long. Check your connection and try again.' : (cause.message || 'Could not play the song. Please try again.')
  } finally { clearTimeout(timeout) }
}
// Hidden tabs throttle frame-based serial output. Stop rather than score unseen misses.
function visibilityChanged() { if (document.hidden && busy.value) { stop(); error.value = 'Practice stopped when you left this tab. Start again when you’re ready.' } }
document.addEventListener('visibilitychange', visibilityChanged)
onBeforeUnmount(() => { stop(); unsubscribe(); document.removeEventListener('visibilitychange', visibilityChanged) })
</script>

<template>
  <section class="practice-page music-page">
    <button class="text-button back-button" @click="emit('back')">← Back to the grove</button>
    <div class="section-heading"><div><span class="eyebrow">FIND YOUR GROOVE</span><h1>Music</h1><p>Your favorite song. Your own rhythm.</p></div><span class="mode-icon music"><AppIcon name="note" :size="30"/></span></div>
    <div class="practice-card music-card">
      <div class="song-banner">
        <div class="song-record" :class="{ spinning: phase === 'playing' }"><AppIcon name="note" :size="30"/></div>
        <div class="song-details"><span class="eyebrow">{{ song.album }}</span><h2>{{ song.title }}</h2><p>{{ song.artist }}</p><div class="song-tags"><span>{{ song.bpm }} BPM</span><span>Full song · {{ formatTime(duration) }}</span><span>480 beats</span></div></div>
      </div>
      <div class="music-controls">
        <label class="music-volume"><AppIcon name="sound" :size="18"/> Music volume <input aria-label="Music volume" type="range" min="0" max="100" v-model.number="volume"/><span>{{ volume }}%</span></label>
        <label class="music-guide"><input type="checkbox" v-model="guide" :disabled="busy"/> Beat guide sound</label>
      </div>
      <div class="session-instruction" aria-live="polite"><p>{{ instructions }}</p><span v-if="phase === 'countin'" class="countdown">{{ countdown }}</span><span v-else class="feedback" :class="feedback.toLowerCase()">{{ phase === 'loading' ? 'Loading song…' : phase === 'done' ? `${accuracy}% accuracy` : feedback || 'Feel the music' }}</span></div>
      <div class="beat-indicators music-beats" aria-label="Song beat"><div v-for="n in 4" :key="n" :class="{ active: activeBeat === n - 1 }"><span>{{ n }}</span></div></div>
      <DrumIllustration small :hit="hit" @hit="emit('hit')"/>
      <p class="input-hint">Tap the drum or press <kbd>space</kbd> · Purple light = your next beat</p>
      <div class="music-score"><div><strong>{{ accuracy }}%</strong><span>Accuracy</span></div><div><strong>{{ counts.Perfect }}</strong><span>Perfect</span></div><div><strong>{{ counts.Good }}</strong><span>Good</span></div><div><strong>{{ counts.Miss }}</strong><span>Miss</span></div></div>
      <div class="song-timeline"><span>{{ formatTime(elapsed) }}</span><div class="round-progress" role="progressbar" aria-label="Song progress" :aria-valuenow="Math.round(progress)" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${progress}%` }"/></div><span>{{ formatTime(duration) }}</span></div>
      <p v-if="error" class="music-error" role="alert">{{ error }}</p>
      <button class="primary-button session-start" @click="busy ? stop() : start()"><AppIcon :name="busy ? 'close' : 'play'" :size="18"/>{{ phase === 'loading' ? 'Cancel loading' : busy ? 'End song' : phase === 'done' ? 'Play again' : 'Play song' }}</button>
      <p class="practice-footnote">4-beat count-in <span>·</span> Original tempo <span>·</span> Perfect ±65 ms</p>
      <details class="music-calibration"><summary>Timing adjustment</summary><p>If the guide feels early or late on your device, adjust it before starting. Positive values move the guide and scoring later; the song stays at its original speed.</p><label>Beat offset <input type="number" min="-250" max="250" step="5" v-model.number="offset" :disabled="busy"/> ms</label><button class="text-button" :disabled="busy" @click="offset = 0">Reset</button></details>
    </div>
  </section>
</template>
