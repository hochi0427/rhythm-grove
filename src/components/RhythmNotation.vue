<script setup>
import { computed } from 'vue'
import { patternEvents } from '../lib/rhythm'
const props = defineProps({ notes: Array, activeBeat: { default: -1 }, results: { default: () => [] } })
const events = computed(() => patternEvents(props.notes))
const width = computed(() => 80 + events.value.length * 58)
function resultAt(index) { return props.results[events.value.slice(0, index).filter(e => !e.rest).length] }
</script>
<template><div class="notation-wrap"><svg :viewBox="`0 0 ${width} 130`" role="img" :aria-label="notes.map(n => n === 0 ? 'quarter rest' : n === .5 ? 'eighth note' : 'quarter note').join(', ')"><path v-for="y in [42, 54, 66, 78, 90]" :key="y" :d="`M12 ${y}H${width-12}`" stroke="#d5dfd1"/><text x="14" y="74" fill="#799078" font-size="26">4</text><text x="14" y="97" fill="#799078" font-size="26">4</text><g v-for="(event, i) in events" :key="i" :transform="`translate(${65+i*58},0)`" :class="{ 'note-active': activeBeat >= event.beat && activeBeat < event.beat + event.duration }"><rect x="-21" y="18" width="47" height="91" rx="10" class="note-highlight"/><g :fill="resultAt(i) === 'Miss' ? '#b06e57' : '#315c46'" :stroke="resultAt(i) === 'Miss' ? '#b06e57' : '#315c46'"><template v-if="!event.rest"><ellipse cx="0" cy="77" rx="8" ry="5.6" transform="rotate(-18 0 77)"/><path d="M7 76V35" stroke-width="2.5"/><path v-if="event.duration === .5" d="M7 35c0 15 19 12 9 28 4-14-9-9-9-19Z"/></template><path v-else d="m1 38 7 12-10 11 9 10q-17-4-9 17-17-13-2-21l-7-9 10-10Z" stroke-width="1"/></g></g></svg></div></template>
