<template>
  <v-card variant="outlined" class="mb-3">
    <v-card-text class="pa-4">
      <div class="d-flex align-center justify-space-between mb-2">
        <div class="d-flex align-center ga-3">
          <span class="text-h6 font-weight-medium">{{ scan.targetUrl }}</span>
          <ScanStatusChip :status="scan.status" />
        </div>
        <span class="text-caption text-medium-emphasis">
          {{ formatDate(scan.createdAt) }}
        </span>
      </div>

      <div class="d-flex ga-4 text-body-2 text-medium-emphasis mb-3">
        <span>
          <v-icon size="small" class="mr-1">mdi-source-repository</v-icon>
          {{ scan.repoPath }}
        </span>
        <span v-if="scan.workflowId">
          <v-icon size="small" class="mr-1">mdi-identifier</v-icon>
          {{ scan.workflowId }}
        </span>
      </div>

      <!-- Progress for running scans -->
      <div v-if="scan.status === 'running'" class="mb-2">
        <div class="d-flex align-center justify-space-between mb-1">
          <span class="text-body-2">
            <span v-if="scan.currentAgent" class="text-info">
              {{ scan.currentAgent }}
            </span>
            <span v-if="scan.currentPhase" class="text-medium-emphasis ml-1">
              ({{ scan.currentPhase }})
            </span>
          </span>
          <span class="text-body-2 text-medium-emphasis">
            {{ scan.completedAgents.length }} / 13 agents
          </span>
        </div>
        <v-progress-linear
          :model-value="(scan.completedAgents.length / 13) * 100"
          color="info"
          height="6"
          rounded
        />
      </div>

      <!-- Summary for completed scans -->
      <div v-if="scan.status === 'completed' && scan.summary" class="d-flex ga-4 text-body-2">
        <v-chip size="x-small" variant="text" prepend-icon="mdi-clock-outline">
          {{ formatDuration(scan.summary.totalDurationMs) }}
        </v-chip>
        <v-chip size="x-small" variant="text" prepend-icon="mdi-robot-outline">
          {{ scan.summary.agentCount }} agents
        </v-chip>
        <v-chip size="x-small" variant="text" prepend-icon="mdi-repeat">
          {{ scan.summary.totalTurns }} turns
        </v-chip>
        <v-chip size="x-small" variant="text" prepend-icon="mdi-currency-usd">
          ${{ scan.summary.totalCostUsd.toFixed(2) }}
        </v-chip>
      </div>

      <!-- Error for failed scans -->
      <v-alert
        v-if="scan.status === 'failed' && scan.error"
        type="error"
        variant="tonal"
        density="compact"
        class="mt-2"
      >
        {{ scan.error }}
      </v-alert>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import type { Scan } from '../api';
import ScanStatusChip from './ScanStatusChip.vue';

defineProps<{ scan: Scan }>();

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
</script>
