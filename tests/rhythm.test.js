import test from 'node:test'
import assert from 'node:assert/strict'
import { createEvaluator, patternEvents, levels } from '../src/lib/rhythm.js'

test('patterns preserve eighth notes and silence during quarter rests', () => {
  assert.deepEqual(patternEvents([1, .5, .5, 0, 1]), [
    { beat: 0, duration: 1, rest: false },
    { beat: 1, duration: .5, rest: false },
    { beat: 1.5, duration: .5, rest: false },
    { beat: 2, duration: 1, rest: true },
    { beat: 3, duration: 1, rest: false },
  ])
  for (const level of Object.values(levels)) {
    const events = patternEvents(level.notes)
    assert.equal(events.at(-1).beat + events.at(-1).duration, 8)
  }
})

test('perfect and good timing boundaries use the nearest unjudged note', () => {
  const evaluator = createEvaluator([1000, 2000, 3000, 4000])
  assert.equal(evaluator.hit(935), 'Perfect')
  assert.equal(evaluator.hit(2066), 'Good')
  assert.equal(evaluator.hit(3130), 'Good')
  assert.equal(evaluator.hit(4131), 'Miss')
  assert.equal(evaluator.accuracy, 60)
})

test('missing a beat expires it and prevents a late hit from scoring', () => {
  const evaluator = createEvaluator([1000, 2000])
  assert.equal(evaluator.expire(1180), false)
  assert.equal(evaluator.expire(1181), true)
  assert.equal(evaluator.expire(1200), false)
  assert.equal(evaluator.hit(1190), 'Miss')
  assert.equal(evaluator.hit(2000), 'Perfect')
  assert.deepEqual(evaluator.results, ['Miss', 'Perfect'])
  assert.equal(evaluator.accuracy, 33)
})

test('extra and duplicate hits reduce accuracy without consuming future notes', () => {
  const evaluator = createEvaluator([1000, 2000])
  assert.equal(evaluator.hit(500), 'Miss')
  assert.equal(evaluator.hit(1000), 'Perfect')
  assert.equal(evaluator.hit(1010), 'Miss')
  assert.equal(evaluator.hit(2000), 'Perfect')
  assert.equal(evaluator.accuracy, 50)
})

test('a silent round scores zero and judges every missed note', () => {
  const evaluator = createEvaluator([1000, 2000, 3000])
  assert.equal(evaluator.accuracy, 0)
  evaluator.expire(4000)
  assert.deepEqual(evaluator.results, ['Miss', 'Miss', 'Miss'])
  assert.equal(evaluator.accuracy, 0)
})
