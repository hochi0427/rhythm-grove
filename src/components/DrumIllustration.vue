<script setup>
defineProps({ hit: Boolean, small: Boolean })
defineEmits(['hit'])
</script>
<template>
  <button class="drum-button" :class="{ struck: hit, small }" @click="$emit('hit')" aria-label="Play drum">
    <svg viewBox="0 0 460 350" class="drum-art" aria-hidden="true">
      <ellipse cx="234" cy="305" rx="137" ry="15" fill="#315c46" opacity=".08"/>
      <g class="plant" fill="none" stroke="#829b68" stroke-width="3" stroke-linecap="round"><path d="M93 284q-15-51-45-86M88 264q20-40 14-75M369 286q9-43 40-75"/><path d="M66 226q-36-1-32-25 28 0 32 25M83 254q-30 5-34-18 26-6 34 18M98 226q-19-21-3-36 20 15 3 36M386 250q-6-27 16-30 7 22-16 30M394 238q30 1 29-22-24-2-29 22" fill="#aabd8d" stroke="none"/></g>
      <g class="drum-body"><path d="M120 147l17 117c4 37 185 41 192 0l16-117" fill="#9dae89" stroke="#315c46" stroke-width="3"/><path d="M149 170l11 103M186 180l5 103M232 183v105M277 179l-5 104M318 168l-12 105" stroke="#e9eacb" stroke-width="7"/><path d="m143 181 42 87 48-82 43 82 43-90" fill="none" stroke="#496b4e" stroke-width="3"/><ellipse cx="232" cy="146" rx="114" ry="43" fill="#547750" stroke="#315c46" stroke-width="3"/><ellipse cx="232" cy="138" rx="114" ry="43" fill="#dbe3b9" stroke="#315c46" stroke-width="3"/><ellipse cx="232" cy="135" rx="101" ry="32" fill="#f2efdb" stroke="#9ba87b" stroke-width="2"/><path d="M138 148q91 50 190 0" fill="none" stroke="#fffdf0" stroke-width="3"/><path d="M139 262q91 43 188 0" fill="none" stroke="#315c46" stroke-width="9"/></g>
      <g class="sticks" stroke-linecap="round"><path d="m160 60 90 65" stroke="#315c46" stroke-width="13"/><path d="m160 58 90 65" stroke="#d4b88b" stroke-width="8"/><path d="m302 48-67 77" stroke="#315c46" stroke-width="13"/><path d="m302 46-67 77" stroke="#d4b88b" stroke-width="8"/></g>
      <g fill="#789267"><path d="M99 99v-20l16-4v17h-3V80l-10 3v16Z"/><ellipse cx="98" cy="99" rx="5" ry="3"/><ellipse cx="111" cy="93" rx="5" ry="3"/><path d="M361 114V94l14 4v4l-11-3v15Z"/><ellipse cx="359" cy="115" rx="5" ry="3"/></g>
      <g stroke="#8a9f6c" stroke-width="2.5" stroke-linecap="round"><path d="M216 51v9M200 58l5 7M230 55l-4 8M345 180h8M349 176v8"/></g>
    </svg>
  </button>
</template>
