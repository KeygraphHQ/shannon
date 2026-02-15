<template>
  <v-chip :color="color" :prepend-icon="icon" size="small" variant="tonal">
    {{ label }}
  </v-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ status: string }>();

const color = computed(() => {
  switch (props.status) {
    case 'running':
      return 'info';
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    default:
      return 'grey';
  }
});

const icon = computed(() => {
  switch (props.status) {
    case 'running':
      return 'mdi-loading mdi-spin';
    case 'completed':
      return 'mdi-check-circle';
    case 'failed':
      return 'mdi-alert-circle';
    default:
      return 'mdi-clock-outline';
  }
});

const label = computed(() => {
  return props.status.charAt(0).toUpperCase() + props.status.slice(1);
});
</script>
