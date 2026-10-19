// All hardware transports should call emitHit('arduino', performance.now()).
// Incoming hardware timestamps must first be converted to this browser's clock.
const listeners = new Set()
export const drumInput = {
  practiceActive: false,
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  emitHit(source = 'pointer', timestamp = performance.now()) {
    listeners.forEach(listener => listener({ source, timestamp }))
  },
  attachKeyboard() {
    const handler = event => {
      if (event.code !== 'Space' || event.repeat || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || (event.target.tagName === 'BUTTON' && !this.practiceActive) || event.target.isContentEditable) return
      event.preventDefault()
      this.emitHit('keyboard')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  },
}
