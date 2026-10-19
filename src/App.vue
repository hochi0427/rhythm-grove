<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import AppIcon from './components/AppIcon.vue'
import ArduinoConnection from './components/ArduinoConnection.vue'
import { useArduino } from './composables/useArduino'
import DrumIllustration from './components/DrumIllustration.vue'
import ModeCard from './components/ModeCard.vue'
import PracticeSession from './components/PracticeSession.vue'
import { drumInput } from './services/drumInput'
import { playDrum, unlockAudio } from './services/audio'
const modes = [
  { id: 'follow', name: 'Follow the Beat', icon: 'beat', description: 'Find your steady pulse. Play along with a visual metronome and stay on the beat.', tag: 'Feel the pulse', skill: 'Timing & consistency' },
  { id: 'copy', name: 'Copy the Rhythm', icon: 'headphones', description: 'Listen, remember, repeat. Train your ears and bring a rhythm back to life.', tag: 'Listen & repeat', skill: 'Listening & memory' },
  { id: 'read', name: 'Read & Play', icon: 'note', description: 'Turn notes into sound. Read a rhythm and let your hands do the talking.', tag: 'Make music', skill: 'Reading & coordination' },
]
const { connection, connectArduino, disconnectArduino } = useArduino()
const page = ref('home'), selected = ref(null), hit = ref(false), help = ref(false)
let hitTimer
const stats = ref(readStats())
function readStats() { try { const s = JSON.parse(localStorage.getItem('rhythm-grove-progress')); return { rounds: Number(s?.rounds) || 0, totalAccuracy: Number(s?.totalAccuracy) || 0, seconds: Number(s?.seconds) || 0, modes: Array.isArray(s?.modes) ? s.modes : [] } } catch { return { rounds: 0, totalAccuracy: 0, seconds: 0, modes: [] } } }
const average = computed(() => stats.value.rounds ? Math.round(stats.value.totalAccuracy / stats.value.rounds) : 0)
const currentMode = computed(() => modes.find(m => m.id === selected.value))
function selectMode(id) { selected.value = id; page.value = 'home'; window.scrollTo({ top: 0, behavior: 'smooth' }) }
function goHome() { selected.value = null; page.value = 'home' }
function complete(result) { stats.value.rounds++; stats.value.totalAccuracy += result.accuracy; stats.value.seconds += result.seconds; if (!stats.value.modes.includes(result.mode)) stats.value.modes.push(result.mode); try { localStorage.setItem('rhythm-grove-progress', JSON.stringify(stats.value)) } catch {} }
const detachKeyboard = drumInput.attachKeyboard()
const unsubscribe = drumInput.subscribe(async () => { hit.value = false; clearTimeout(hitTimer); requestAnimationFrame(() => { hit.value = true; hitTimer = setTimeout(() => hit.value = false, 180) }); await unlockAudio(); playDrum() })
function triggerHit() { drumInput.emitHit('pointer') }
onBeforeUnmount(() => { detachKeyboard(); unsubscribe(); clearTimeout(hitTimer) })
</script>
<template>
  <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#" @click.prevent="goHome"><span class="brand-symbol"><AppIcon name="leaf" :size="28"/></span><span>rhythm<span class="brand-second">grove<span class="brand-dot">.</span></span></span></a>
      <div class="sidebar-label">YOUR LITTLE MUSIC SPACE</div>
      <nav aria-label="Main navigation"><button :class="{ selected: page === 'home' && !selected }" @click="goHome"><AppIcon name="grid" :size="20"/>The Grove<span v-if="page === 'home' && !selected" class="nav-dot"/></button><button :class="{ selected: page === 'progress' }" @click="selected = null; page = 'progress'"><AppIcon name="sprout" :size="21"/>My progress</button></nav>
      <div class="sidebar-modes"><span class="sidebar-label">LET’S PRACTICE</span><button v-for="mode in modes" :key="mode.id" :class="{ selected: selected === mode.id }" @click="selectMode(mode.id)"><AppIcon :name="mode.icon" :size="19"/>{{ mode.name }}</button></div>
      <div class="sidebar-bottom"><div class="device-card"><span class="device-icon"><AppIcon name="plug" :size="20"/></span><div><strong>Play your way</strong><span><i/>{{ connection.status === 'connected' ? 'Arduino connected' : 'Keyboard mode' }}</span></div><span class="device-dot"/></div><p class="device-note">{{ connection.status === 'connected' ? 'Arduino Nano Every connected.' : 'Arduino disconnected.' }}<br/>Keyboard input is always ready.</p><button class="help-button" @click="help = true"><AppIcon name="help" :size="18"/>A little help<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m9 5 7 7-7 7"/></svg></button></div>
    </aside>
    <main>
      <header class="topbar"><div class="breadcrumb"><AppIcon name="leaf" :size="16"/><span>Your space to find your rhythm</span></div><div class="topbar-inputs"><ArduinoConnection :connection="connection" @connect="connectArduino" @disconnect="disconnectArduino"/><div class="keyboard-status"><span/>Keyboard ready<kbd>space</kbd></div></div></header>
      <div class="main-content">
        <PracticeSession v-if="selected" :key="selected" :mode="currentMode" :hit="hit" @back="goHome" @hit="triggerHit" @complete="complete"/>
        <template v-else-if="page === 'home'">
          <div class="welcome-heading"><div><div class="eyebrow"><span/>A LITTLE RHYTHM. A LOT OF GROWTH.</div><h1>Welcome to Rhythm Grove<span class="heading-dot">.</span></h1><p>Learn rhythm through listening, reading, and playing.</p></div><span class="welcome-flower" aria-hidden="true">✳</span></div>
          <section class="hero-card"><div class="hero-copy"><span class="hero-tag"><AppIcon name="sprout" :size="15"/>EVERY BEAT IS A NEW BEGINNING</span><h2>Find your rhythm.<br/>Watch it grow.</h2><p>No perfect timing needed to begin.<br/>Just a little curiosity and a beat to follow.</p><button class="primary-button" @click="selectMode('follow')">Let’s make some music<AppIcon name="arrow" :size="19"/></button><div class="hero-hint"><span class="tiny-key">⌨</span> Press <kbd>space</kbd> or tap the drum to try it</div></div><div class="hero-illustration"><span class="orbit orbit-one"/><span class="orbit orbit-two"/><DrumIllustration :hit="hit" @hit="triggerHit"/><span class="drum-caption">a little tap goes a long way</span></div></section>
          <section class="mode-section"><div class="section-heading"><div><h2>How will you play today?</h2><p>Three ways to practice. One rhythm at a time.</p></div><span class="section-side-note">EXPLORE YOUR GROOVE<AppIcon name="arrow" :size="16"/></span></div><div class="mode-grid"><ModeCard v-for="(mode, i) in modes" :key="mode.id" :mode="mode" :index="i" @select="selectMode"/></div></section>
          <section class="growth-strip"><span class="growth-icon"><AppIcon name="sprout" :size="28"/></span><div><h3>Small beats. Steady progress.</h3><p>A few minutes of practice today can make tomorrow feel a little more in sync.</p></div><span class="growth-pill">Grow at your own pace<AppIcon name="leaf" :size="15"/></span></section>
        </template>
        <template v-else><div class="welcome-heading"><div><span class="eyebrow">EVERY BEAT COUNTS</span><h1>Your rhythm is growing<span class="heading-dot">.</span></h1><p>A little look at your practice journey. Saved on this device.</p></div><AppIcon name="sprout" :size="44"/></div><div class="stats-grid"><div class="stat-card"><AppIcon name="trophy"/><strong>{{ stats.rounds }}</strong><span>Rounds completed</span></div><div class="stat-card"><AppIcon name="beat"/><strong>{{ average }}%</strong><span>Average accuracy</span></div><div class="stat-card"><AppIcon name="clock"/><strong>{{ Math.round(stats.seconds / 60) }} min</strong><span>Time making music</span></div></div><section class="mode-section"><div class="section-heading"><div><h2>Keep your grove growing</h2><p>{{ stats.rounds ? 'Come back to a favorite or try a new skill.' : 'Your first round is the start of something good.' }}</p></div></div><div class="mode-grid"><ModeCard v-for="(mode, i) in modes" :key="mode.id" :mode="{ ...mode, tag: stats.modes.includes(mode.id) ? 'Practiced ✓' : mode.tag }" :index="i" @select="selectMode"/></div></section></template>
        <footer><span>Made for curious minds & a good sense of rhythm.</span><span><AppIcon name="leaf" :size="13"/>LISTEN. PLAY. GROW.</span></footer>
      </div>
    </main>
    <div v-if="help" class="modal-backdrop" @click.self="help = false"><section class="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" @keydown.esc="help = false"><button class="close-button" @click="help = false" autofocus aria-label="Close help"><AppIcon name="close"/></button><span class="mode-icon"><AppIcon name="headphones"/></span><h2 id="help-title">Make yourself at home.</h2><p>Press the spacebar or tap the illustrated drum to play. Turn your sound on, choose a mode, and start a round.</p><p>Wait for the four-beat count-in. In Copy the Rhythm, listen to the pattern, then repeat it after a second count-in. Rests mean silence.</p><p><strong>Perfect</strong> is within 65 ms of a note. <strong>Good</strong> is within 130 ms. Missed and extra hits lower your accuracy.</p><div class="help-device"><AppIcon name="plug"/><p><strong>Arduino Nano Every</strong><br/>Use Connect Arduino to select your board’s USB serial port. Send HIT followed by a newline at 115200 baud. Keyboard and touch input stay available. Close Arduino Serial Monitor before connecting.</p></div><button class="primary-button" @click="help = false">Got it. Let’s play<AppIcon name="arrow" :size="18"/></button></section></div>
  </div>
</template>
