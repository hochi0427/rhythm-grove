// Input routing only; judgement feedback remains owned by the rhythm evaluator.
export function createArduinoFeedback({ input, sendCommand, now = () => performance.now() }) {
  return {
    handleHit() {
      const freePlay = !input.practiceActive
      input.emitHit('arduino', now())
      if (freePlay) {
        // A hit waiting in the serial queue must not flash after a round starts.
        void sendCommand('PURPLE', { shouldSend: () => !input.practiceActive })
      }
    },
    countdownBeat(shouldSend) {
      return sendCommand('PURPLE', { shouldSend })
    },
  }
}
