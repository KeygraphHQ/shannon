<template>
  <v-app>
    <v-app-bar flat color="surface" border="b">
      <v-app-bar-title>
        <div class="d-flex align-center ga-2">
          <v-icon color="primary">mdi-shield-search</v-icon>
          <span class="font-weight-bold">Shannon</span>
          <span class="text-medium-emphasis font-weight-light">Scanner</span>
        </div>
      </v-app-bar-title>
    </v-app-bar>

    <v-main>
      <v-container class="py-6" style="max-width: 900px">
        <!-- Header row -->
        <div class="d-flex align-center justify-space-between mb-6">
          <div>
            <h1 class="text-h4 font-weight-bold">Scans</h1>
            <p class="text-body-2 text-medium-emphasis mt-1">
              Security scan pipeline runs
            </p>
          </div>
          <NewScanDialog @created="syncAndRefresh" />
        </div>

        <!-- Loading state -->
        <div v-if="loading && scans.length === 0" class="text-center py-12">
          <v-progress-circular indeterminate color="primary" size="48" />
          <p class="text-body-1 text-medium-emphasis mt-4">Loading scans...</p>
        </div>

        <!-- Error state -->
        <v-alert v-else-if="error" type="error" variant="tonal" class="mb-4">
          {{ error }}
          <template #append>
            <v-btn variant="text" size="small" @click="fetchScans">Retry</v-btn>
          </template>
        </v-alert>

        <!-- Empty state -->
        <v-card
          v-else-if="scans.length === 0"
          variant="outlined"
          class="text-center py-12"
        >
          <v-icon size="64" color="grey-darken-1" class="mb-4">
            mdi-radar
          </v-icon>
          <h3 class="text-h6 text-medium-emphasis mb-2">No scans yet</h3>
          <p class="text-body-2 text-medium-emphasis">
            Launch a new scan to start analyzing a target.
          </p>
        </v-card>

        <!-- Scan list -->
        <div v-else>
          <ScanCard v-for="scan in scans" :key="scan.id" :scan="scan" />
        </div>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import NewScanDialog from './components/NewScanDialog.vue';
import ScanCard from './components/ScanCard.vue';
import { useScans } from './composables/useScans';

const { scans, loading, error, fetchScans, syncAndRefresh } = useScans();
</script>
