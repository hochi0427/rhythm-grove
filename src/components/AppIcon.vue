<script setup>
defineProps({ name: String, size: { default: 24 } })
const paths = {
 leaf: 'M20 4C10 2 3 7 5 14c2 7 12 7 15-10ZM5 20l10-11',
 grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 beat: 'M3 12h4l3-8 4 16 3-8h4',
 headphones: 'M4 14v-3a8 8 0 0 1 16 0v3 M4 12h3v8H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2ZM20 12h-3v8h3a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z',
 note: 'M10 17V5l10-2v12 M10 8l10-2 M10 17c0 2-6 4-6 1s6-4 6-1ZM20 15c0 2-6 4-6 1s6-4 6-1Z',
 arrow: 'M5 12h14 M13 6l6 6-6 6',
 plug: 'M9 3v5 M15 3v5 M7 8h10v4a5 5 0 0 1-10 0V8ZM12 17v4',
 help: 'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 18h.01',
 close: 'M6 6l12 12 M6 18 18 6',
 check: 'M5 12l4 4L19 6',
 sound: 'M4 9h4l5-4v14l-5-4H4V9ZM17 8a6 6 0 0 1 0 8 M20 5a10 10 0 0 1 0 14',
 sprout: 'M12 21v-9 M12 15C3 15 3 6 3 6s9-1 9 9ZM12 12c0-9 9-9 9-9s1 9-9 9',
 clock: 'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
 trophy: 'M8 3h8v7a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4 M16 5h4v3a4 4 0 0 1-4 4 M12 14v6 M8 21h8',
 play: 'M8 5l11 7-11 7V5Z'
}
</script>
<template><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.leaf" /></svg></template>
