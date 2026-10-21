export const levels = {
  easy: { label: 'Seedling', bpm: 72, notes: [1, 1, 0, 1, 1, 0, 1, 1] },
  medium: { label: 'Growing', bpm: 88, notes: [1, .5, .5, 0, 1, .5, .5, 1, 0, 1] },
  hard: { label: 'Blooming', bpm: 104, notes: [.5, .5, 0, .5, .5, 1, .5, .5, 0, 1, 1] },
}
// A rest (0) occupies one beat; positive values are note lengths in beats.
export function patternEvents(notes) {
  let beat = 0
  return notes.map(duration => {
    const event = { beat, duration: duration || 1, rest: duration === 0 }
    beat += duration || 1
    return event
  })
}
export function createEvaluator(expected, windowMs = 180, onJudgement = () => {}) {
  const judged = new Map()
  let extras = 0
  return {
    hit(time) {
      let nearest = -1, distance = Infinity
      expected.forEach((target, index) => {
        const delta = Math.abs(target - time)
        if (!judged.has(index) && delta < distance) { nearest = index; distance = delta }
      })
      if (nearest < 0 || distance > windowMs) { extras++; onJudgement('Miss'); return 'Miss' }
      const result = distance <= 65 ? 'Perfect' : distance <= 130 ? 'Good' : 'Miss'
      judged.set(nearest, result)
      onJudgement(result)
      return result
    },
    expire(time) {
      let missed = false
      expected.forEach((target, index) => {
        if (!judged.has(index) && time > target + windowMs) {
          judged.set(index, 'Miss'); missed = true
          onJudgement('Miss')
        }
      })
      return missed
    },
    get results() { return expected.map((_, index) => judged.get(index)) },
    get accuracy() {
      const score = [...judged.values()].reduce((sum, result) => sum + (result === 'Perfect' ? 1 : result === 'Good' ? .7 : 0), 0)
      return judged.size + extras ? Math.round(score / (judged.size + extras) * 100) : 0
    },
  }
}
