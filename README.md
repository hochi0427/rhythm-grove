# Rhythm Grove

A responsive Vue 3 rhythm learning app for listening, reading, and playing. Runs entirely in the browser; no Arduino or backend required.

## Run

```sh
npm install
npm run dev
```

```sh
npm test
npm run build
npm run preview
```

## Play

- Press **Space** or click/tap the drum to play a synthesized drum sound. Sound starts after your first interaction.
- **Follow the Beat:** choose 60–120 BPM, wait for the four-beat count-in, then play 16 beats along with the visual metronome.
- **Copy the Rhythm:** choose a difficulty, listen to an eight-beat pattern, wait for a second four-beat count-in, and repeat it.
- **Read & Play:** choose a difficulty and play the displayed quarter notes, eighth notes, and quarter rests after the count-in. Rests occupy one beat of silence.
- Perfect: within 65 ms. Good: within 130 ms. Hits within 180 ms consume the closest unjudged note; hits outside the Good window score Miss. Missing and extra hits reduce accuracy. Perfect earns 1 point; Good earns 0.7. Accuracy is earned points divided by judged notes plus extra hits, rounded to a percentage.
- Completed rounds, average accuracy, practice time, and practiced modes are stored locally on this browser. A stopped round does not count.

## Architecture

- `src/App.vue`: navigation, shared drum animation/audio feedback, local progress.
- `src/components/`: reusable icons, interactive SVG drum, mode cards, notation renderer, practice session.
- `src/services/drumInput.js`: shared timestamped input event hub for keyboard, pointer, and Arduino hits.
- `src/services/arduinoSerial.js`: Web Serial connection lifecycle, bounded line parsing, and serialized LED command writes on the same port.
- `src/composables/useArduino.js`: reactive connection state and routing serial hits into the shared drum input.
- `src/components/ArduinoConnection.vue`: connection controls and accessible connection/error status.
- `src/services/audio.js`: Web Audio oscillator synthesis and scheduled cue cleanup.
- `src/lib/rhythm.js`: pure pattern expansion and timing evaluation, separate from Vue and UI.
- `tests/rhythm.test.js`: rhythm durations, scoring boundaries, missed notes, extra hits, and silent rounds.

Session timing uses `performance.now()`; audio cues are scheduled on the Web Audio clock. Ending a round, switching modes, or leaving practice cancels scheduled sounds and animation frames. Browser/device audio latency may affect perceived timing; this version has no latency calibration.

## Arduino Nano Every integration

1. Open the app in a browser with Web Serial support, such as desktop Chrome or Edge, using localhost (`npm run dev`) or HTTPS. Unsupported browsers show an explanation and retain keyboard/touch controls.
2. Connect the Nano Every over USB. Close Arduino IDE Serial Monitor and any other program using the port.
3. Click **Connect Arduino**, then select the board’s serial port. The app opens it at **115200 baud** and shows **Connected**. Cancelling the chooser leaves keyboard input available.
4. Send one `HIT` line for each detected drum strike. Both `HIT\n` and Arduino’s default `HIT\r\n` are accepted. Other lines are ignored. Fragmented serial reads and multiple lines per read are handled automatically.
5. Click **Disconnect** to release the port. Unplugging the board or a read error shows a recovery message and returns the status to **Disconnected**. Reconnect with the same button. Keyboard and touch remain available throughout.

In your existing Arduino sketch, initialize the port in `setup()`:

```cpp
Serial.begin(115200);
```

In your existing sensor detection code, send this once per detected strike (apply sensor threshold/debounce on the Arduino):

```cpp
Serial.println("HIT");
```

The browser routes each complete command through `drumInput.emitHit('arduino', performance.now())`. This triggers the existing drum sound and animation globally, and the active practice session evaluates the hit in **Follow the Beat**, **Copy the Rhythm**, and **Read & Play**. Timing uses browser receipt time; USB/serial latency is not calibrated. Connecting also unlocks Web Audio using the button gesture.

The transport cancels pending reads, finishes any active write, releases reader/writer locks, and closes the port on disconnect or component teardown. It prevents overlapping connections, drops unfinished lines when reconnecting, and discards oversized lines. Automated tests use mocked serial ports; real board/sensor operation still needs a hardware check.

### LED judgement feedback

The existing Arduino firmware receives these exact commands on the **same 115200-baud connection**:

| Evaluated judgement | Serial command | Firmware LED color |
| --- | --- | --- |
| Perfect | `PERFECT\n` | Green |
| Good | `GOOD\n` | Blue |
| Miss | `MISS\n` | Red |

All three modes use the evaluator's optional `onJudgement` callback. It fires after a hit receives its result or after an unjudged note expires. `PracticeSession` emits that result to `App`, which calls `useArduino().sendJudgement()`. During a round, no command is sent merely because `HIT` arrives; playing hits wait for evaluation and count-in/listening hits remain unjudged. Outside a round, physical hits receive purple feedback instead. Keyboard and pointer hits receive the same feedback when a board is connected.

Already judged notes never expire again. Each newly expired note produces its own `MISS`, even when multiple notes expire in one animation frame. Separate hits/notes with the same result still produce separate commands; UI updates do not resend results. Timing windows, scoring, sound, animations, and firmware are unchanged.

The reusable `sendArduinoCommand(command)` composable method (backed by `transport.sendCommand`) accepts one nonempty line without its terminator, adds exactly one newline, and returns a promise resolving to `true` on a successful write or `false` if skipped/failed. Writes are serialized per connection, with each writer lock released in `finally`. Disconnected sends are harmless no-ops. Disconnect drops queued commands and waits for any in-flight write to release its lock before closing. Commands from an old connection never transfer to a new connection. A failed judgement is not retried (avoiding potentially duplicated feedback), but it no longer disables later independent judgements. A temporarily locked writable stream is reported and that command is skipped; later commands can succeed once the lock is released. A genuinely errored Web Serial stream may still require reconnecting. Gameplay and incoming hits continue if LED writes fail.

`npm test` covers incoming HIT parsing, exact LED strings, serial write ordering and lock release, unplugging during a write, both Miss paths, duplicate prevention, repeated identical grades, and disconnected operation using mocked Web Serial streams. Real Arduino/LED operation still requires a hardware check.

### Purple feedback: free play and count-ins

The firmware must support `PURPLE\n`; the website does not change firmware or LED duration/color logic.

- Physical `HIT` messages outside a round (home, idle, stopped, or completed) use the shared input handler for sound/animation and send exactly one `PURPLE\n`. Keyboard/pointer hits do not trigger free-play LED commands. No timing grade is calculated for free play.
- Each of the four count-in sounds sends one `PURPLE\n`. Copy the Rhythm also flashes during its second four-beat count-in before the repeat phase. Listening/demo sounds and gameplay metronome sounds do not send purple. Physical hits during a round's count-in/listening phases remain unjudged and do not add purple flashes.
- Active playing hits and missed notes retain the existing `PERFECT\n`, `GOOD\n`, and `MISS\n` commands, with no extra purple.

`playDrum` records each countdown callback at the **same AudioContext timestamp as its oscillator start**. `dispatchAudioBeats()` runs in the existing practice animation loop and dispatches each due callback once; there is no new timer or independent LED metronome. Audio synthesis and existing beat timings are unchanged. Dispatch has animation-frame granularity plus serial/USB latency; it is not sample-accurate hardware synchronization. A throttled frame discards expired beats instead of producing a late burst.

Reset/unmount cancels both scheduled audio and pending beat callbacks. Each callback carries the round generation and count-in deadline. The serial queue checks that guard again immediately before taking a writer, dropping commands whose countdown was cancelled or completed while waiting. A write already started cannot be recalled. Replays create a fresh generation and fresh beat callbacks. The same existing serial connection and write queue handle all colors. Disconnected sends remain safe no-ops.

Implementation: `arduinoFeedback.js` handles free-play input and countdown commands; `useArduino.js` attaches it to the existing transport; `audio.js` owns beat events; `PracticeSession.vue` tags the existing count-in sounds and dispatches callbacks; `App.vue` routes countdown events. `arduinoSerial.js` adds a queue-time validity guard. Tests cover free play, both Copy count-ins, unchanged gameplay feedback in all modes, repeat/cancel/expiry, queued cancellation, exact commands, and disconnected operation.

### Temporary Chrome console diagnostics

Open Chrome DevTools → Console, enable **Info**, **Warnings**, and **Errors**, and filter by `Rhythm Grove`. Refresh the local app, close Arduino Serial Monitor, connect the board, then start a round and wait for its playing phase. A physical hit during play should show:

1. `[Serial] Connection status` with `connected` (on connection).
2. `[Serial] Incoming serial line` and `Incoming HIT → drum input`.
3. `[Game] Drum input received` with `source: arduino`, `phase: playing`, and `evaluated: true`.
4. `[Game] Judgement determined`, followed by `[Serial] Judgement received for LED feedback`.
5. `[Serial] LED command queued`, then `Outgoing LED command`, `Serial write succeeded`, and `Writer released`.

The outgoing log displays the quoted payload with its escaped newline and the actual encoded byte array. Expected bytes are `80,69,82,70,69,67,84,10` for `PERFECT\n`, `71,79,79,68,10` for `GOOD\n`, and `77,73,83,83,10` for `MISS\n`. The last byte is a real newline (`10`), not literal backslash/n. `writableLocked: true` is normal **after this sender acquires its own writer**; `Writer released` should report `false`. `Serial write blocked: writable stream is locked` means another owner already holds the lock before this queued operation starts. The code never releases a different owner's lock.

Hits during count-in/listening intentionally show `evaluated: false` and produce no hit-based LED command; count-in beats have their own purple feedback. Idle/done physical hits show `evaluated: false` and send `PURPLE` for free play. A completely missed note produces a judgement and write without an incoming HIT. A disconnected send logs its skip reason. Write errors include the actual Chrome error object and lock state. A successful write means the browser accepted the bytes; it does not acknowledge that the firmware displayed a color.

The reproduced failure was a silent permanent `writeFailed` flag: one write/acquisition error suppressed every later LED command until reconnecting, even if the original lock/error cleared. The flag is removed and regression-tested. The original cause on a particular physical board cannot be established without its console trace. Serial diagnostics are intentionally temporary (`logger = console` in the transport); gameplay input/judgement logs are marked in `PracticeSession.vue` for removal after hardware testing.

API lifecycle reference: [Chrome’s Web Serial guide](https://developer.chrome.com/docs/capabilities/serial).

Fonts use Google Fonts with local sans-serif fallbacks. All illustrations and sounds are generated by SVG and Web Audio, with no image or audio downloads required.
