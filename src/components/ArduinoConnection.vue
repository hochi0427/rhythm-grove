<script setup>
import AppIcon from './AppIcon.vue'
defineProps({ connection: Object })
defineEmits(['connect', 'disconnect'])
</script>
<template>
  <div class="arduino-connection">
    <div class="arduino-controls">
      <span class="serial-status" :class="{ connected: connection.status === 'connected' }" role="status"><i/>{{ { connected: 'Connected', disconnected: 'Disconnected', connecting: 'Connecting…', disconnecting: 'Disconnecting…' }[connection.status] }}</span>
      <button v-if="connection.status === 'connected'" class="serial-button" @click="$emit('disconnect')">Disconnect</button>
      <button v-else class="serial-button" :disabled="!connection.supported || connection.status !== 'disconnected'" @click="$emit('connect')"><AppIcon name="plug" :size="14"/>Connect Arduino</button>
    </div>
    <p v-if="connection.message" class="serial-message" role="status">{{ connection.message }}</p>
  </div>
</template>
