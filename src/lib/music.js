// Calibrated to the supplied Believe album MP3, not the music-video intro.
// Broadband attack at ~0.035 s; steady kick grid across 15–210 s is 128 BPM.
// The final musical pulse is at 224.56125 s; the remaining file is decay/silence.
export const beautyAndABeat = Object.freeze({
  title: 'Beauty and a Beat',
  artist: 'Justin Bieber feat. Nicki Minaj',
  album: 'Believe · Album version',
  file: 'audio/beauty-and-a-beat.mp3',
  bpm: 128,
  firstBeat: 0.03,
  beatCount: 480,
})

export function songBeats(song, duration, offsetMs = 0) {
  const interval = 60 / song.bpm
  offsetMs = Number.isFinite(offsetMs) ? Math.max(-250, Math.min(250, offsetMs)) : 0
  return Array.from({ length: song.beatCount }, (_, i) => song.firstBeat + i * interval + offsetMs / 1000)
    .filter(time => time >= 0 && time < duration - .18)
}

export function formatTime(seconds) {
  const time = Math.max(0, Math.floor(seconds || 0))
  return `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`
}
