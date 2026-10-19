<script setup>
import AppIcon from './AppIcon.vue'
defineProps({ mode: Object, index: Number })
defineEmits(['select'])
</script>
<template><button class="mode-card" @click="$emit('select', mode.id)"><div class="mode-card-top"><span class="mode-icon" :class="mode.id"><AppIcon :name="mode.icon" :size="28" /></span><span class="mode-number">0{{ index + 1 }}</span></div><h3>{{ mode.name }}</h3><p>{{ mode.description }}</p><div class="mode-card-bottom"><span>{{ mode.tag }}</span><span class="circle-arrow"><AppIcon name="arrow" :size="19" /></span></div></button></template>
