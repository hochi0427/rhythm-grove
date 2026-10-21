import { onBeforeUnmount, ref } from 'vue'
import { createArduinoSerial } from '../services/arduinoSerial'
import { drumInput } from '../services/drumInput'
import { unlockAudio } from '../services/audio'
import { createArduinoFeedback } from '../services/arduinoFeedback'

export function useArduino() {
  const connection = ref({ supported: false, status: 'disconnected', message: '' })
  const feedback = createArduinoFeedback({ input: drumInput, sendCommand: (...args) => transport.sendCommand(...args) })
  const transport = createArduinoSerial({
    serial: navigator.serial,
    secureContext: window.isSecureContext,
    onState: state => { connection.value = state },
    onHit: feedback.handleHit,
  })
  function connectArduino() {
    // Unlock sound in the same click gesture as the serial port chooser.
    void Promise.resolve(unlockAudio()).catch(() => {})
    return transport.connect()
  }
  onBeforeUnmount(() => { void transport.dispose() })
  return { connection, connectArduino, disconnectArduino: transport.disconnect, sendJudgement: transport.sendJudgement, sendArduinoCommand: transport.sendCommand, sendCountdownBeat: feedback.countdownBeat }
}
