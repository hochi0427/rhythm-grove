<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import DrumIllustration from './DrumIllustration.vue'
import RhythmNotation from './RhythmNotation.vue'
import { levels, patternEvents, createEvaluator } from '../lib/rhythm'
import { unlockAudio, playDrum, cancelScheduledAudio } from '../services/audio'
import { drumInput } from '../services/drumInput'
const props = defineProps({ mode: Object, hit: Boolean })
const emit = defineEmits(['back', 'hit', 'complete'])
const bpm = ref(80), level = ref('easy'), phase = ref('idle'), beat = ref(-1), countdown = ref(4)
const accuracy = ref(0), feedback = ref(''), results = ref([]), progress = ref(0)
const busy = computed(() => !['idle', 'done'].includes(phase.value))
const notes = computed(() => levels[level.value].notes)
let frame, evaluator, startTime, repeatTime, endTime, interval, demoTime, generation = 0
const instruction = computed(() => ({ idle: 'A little practice goes a long way.', countin: 'Find the pulse. Your round starts in…', listening: 'Listen closely. Your turn is coming.', ready: 'Your turn! Get ready in…', playing: props.mode.id === 'copy' ? 'Repeat the rhythm you heard.' : 'Play along. You’ve got this.', done: accuracy.value >= 80 ? 'Beautiful rhythm. Keep on growing!' : 'Every beat is a chance to grow.' })[phase.value])
const unsubscribe = drumInput.subscribe(({ timestamp }) => {
  if (phase.value !== 'playing') return
  feedback.value = evaluator.hit(timestamp)
  updateScore()
})
function updateScore() { accuracy.value = evaluator.accuracy; results.value = [...evaluator.results] }
function reset() { drumInput.practiceActive = false; generation++; cancelAnimationFrame(frame); cancelScheduledAudio(); phase.value = 'idle'; feedback.value = ''; beat.value = -1; progress.value = 0; accuracy.value = 0; results.value = [] }
async function start() {
  reset()
  const token = generation
  await unlockAudio()
  if (token !== generation) return
  drumInput.practiceActive = true
  interval = 60000 / (props.mode.id === 'follow' ? bpm.value : levels[level.value].bpm)
  const events = props.mode.id === 'follow' ? Array.from({ length: 16 }, (_, beat) => ({ beat, duration: 1 })) : patternEvents(notes.value)
  const duration = events.at(-1).beat + events.at(-1).duration
  startTime = performance.now() + 120
  demoTime = startTime + interval * 4
  repeatTime = props.mode.id === 'copy' ? demoTime + (duration + 4) * interval : demoTime
  endTime = repeatTime + duration * interval
  const expected = events.filter(e => !e.rest).map(e => repeatTime + e.beat * interval)
  evaluator = createEvaluator(expected)
  for (let i = 0; i < 4; i++) playDrum((startTime + i * interval - performance.now()) / 1000, true)
  if (props.mode.id === 'copy') {
    events.filter(e => !e.rest).forEach(e => playDrum((demoTime + e.beat * interval - performance.now()) / 1000))
    for (let i = 0; i < 4; i++) playDrum((repeatTime - (4-i) * interval - performance.now()) / 1000, true)
  }
  if (props.mode.id === 'follow') expected.forEach(time => playDrum((time - performance.now()) / 1000, true))
  phase.value = 'countin'
  function tick() {
    const now = performance.now()
    if (now < demoTime) { phase.value = 'countin'; countdown.value = Math.min(4, Math.ceil((demoTime-now)/interval)); beat.value = Math.max(0, Math.floor((now-startTime)/interval)) % 4 }
    else if (now < repeatTime) {
      phase.value = now >= repeatTime - 4 * interval ? 'ready' : 'listening'
      countdown.value = Math.ceil((repeatTime-now)/interval)
      beat.value = phase.value === 'ready' ? Math.floor((now-(repeatTime-4*interval))/interval) : (now-demoTime)/interval
    } else {
      phase.value = 'playing'; beat.value = (now-repeatTime)/interval
      progress.value = Math.min(100, (now-repeatTime)/(endTime-repeatTime)*100)
      if (evaluator.expire(now)) feedback.value = 'Miss'
      updateScore()
    }
    if (now >= endTime + 180) {
      drumInput.practiceActive = false
      phase.value = 'done'; beat.value = -1; updateScore()
      emit('complete', { mode: props.mode.id, accuracy: accuracy.value, seconds: Math.round((endTime-repeatTime)/1000) })
      return
    }
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
}
onBeforeUnmount(() => { reset(); unsubscribe() })
</script>
<template>
  <section class="practice-page">
    <button class="text-button back-button" @click="emit('back')">← Back to the grove</button>
    <div class="section-heading"><div><span class="eyebrow">MAKE A LITTLE PROGRESS</span><h1>{{ mode.name }}</h1><p>{{ mode.description }}</p></div><span class="practice-mode-icon mode-icon" :class="mode.id"><AppIcon :name="mode.icon" :size="30"/></span></div>
    <div class="practice-card">
      <div class="practice-controls"><label v-if="mode.id === 'follow'" class="tempo-control">Tempo <input type="range" min="60" max="120" v-model.number="bpm" :disabled="busy"/><strong>{{ bpm }} <small>BPM</small></strong></label><label v-else class="level-control">Difficulty <select v-model="level" :disabled="busy"><option v-for="(value, key) in levels" :key="key" :value="key">{{ value.label }} · {{ key }}</option></select></label><div class="accuracy"><span>Accuracy</span><strong>{{ accuracy }}<small>%</small></strong></div></div>
      <div class="session-instruction" aria-live="polite"><p>{{ instruction }}</p><span v-if="['countin','ready'].includes(phase)" class="countdown">{{ countdown }}</span><span v-else class="feedback" :class="feedback.toLowerCase()">{{ phase === 'done' ? 'Round complete' : feedback || 'Feel the rhythm' }}</span></div>
      <div v-if="mode.id === 'follow'" class="beat-indicators"><div v-for="n in 4" :key="n" :class="{ active: busy && Math.floor(beat) % 4 === n-1 }"><span>{{ n }}</span></div></div>
      <RhythmNotation v-else-if="mode.id === 'read' || phase !== 'listening'" :notes="notes" :active-beat="phase === 'playing' ? beat : -1" :results="results"/>
      <div v-else class="listening-wave" aria-label="Listening to pattern"><i v-for="n in 16" :key="n" :style="{ animationDelay: `${n*.08}s` }" /></div>
      <DrumIllustration small :hit="hit" @hit="emit('hit')"/>
      <p class="input-hint">Tap the drum or press <kbd>space</kbd><span v-if="phase === 'listening'"> · Listen first, then repeat</span></p>
      <div class="round-progress"><span :style="{ width: `${progress}%` }"/></div>
      <button class="primary-button session-start" @click="busy ? reset() : start()"><AppIcon :name="busy ? 'close' : 'play'" :size="18"/>{{ busy ? 'End round' : phase === 'done' ? 'Play again' : 'Start practice' }}</button>
      <p class="practice-footnote">{{ mode.id === 'follow' ? '16 beats' : 'Listen, find your rhythm, and play' }} <span>·</span> 4-beat count-in <span>·</span> Perfect ±65 ms</p>
    </div>
  </section>
</template>
