<template>
  <v-dialog v-model="dialog" max-width="560" persistent>
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        color="primary"
        prepend-icon="mdi-plus"
        size="large"
      >
        New Scan
      </v-btn>
    </template>

    <v-card>
      <v-card-title class="text-h5 pa-6 pb-2">
        Launch New Scan
      </v-card-title>

      <v-card-text class="pa-6 pt-2">
        <v-form ref="formRef" @submit.prevent="submit">
          <v-text-field
            v-model="targetUrl"
            label="Target URL"
            placeholder="https://example.com"
            variant="outlined"
            :rules="[rules.required, rules.url]"
            prepend-inner-icon="mdi-web"
            class="mb-2"
          />

          <v-text-field
            v-model="repoPath"
            label="Repository"
            placeholder="my-repo"
            hint="Folder name inside ./repos/"
            persistent-hint
            variant="outlined"
            :rules="[rules.required, rules.noSlash]"
            prepend-inner-icon="mdi-source-repository"
            class="mb-2"
          />

          <v-text-field
            v-model="configPath"
            label="Config File (optional)"
            placeholder="./configs/my-config.yaml"
            variant="outlined"
            prepend-inner-icon="mdi-file-cog-outline"
          />
        </v-form>

        <v-alert v-if="errorMsg" type="error" variant="tonal" class="mt-2">
          {{ errorMsg }}
        </v-alert>
      </v-card-text>

      <v-card-actions class="pa-6 pt-0">
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          :loading="submitting"
          @click="submit"
        >
          Launch
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { createScan } from '../api';

const emit = defineEmits<{ created: [] }>();

const dialog = ref(false);
const submitting = ref(false);
const errorMsg = ref('');
const formRef = ref<{ validate: () => Promise<{ valid: boolean }> }>();

const targetUrl = ref('');
const repoPath = ref('');
const configPath = ref('');

const rules = {
  required: (v: string) => !!v || 'Required',
  url: (v: string) => {
    try {
      new URL(v);
      return true;
    } catch {
      return 'Must be a valid URL';
    }
  },
  noSlash: (v: string) =>
    !v.includes('/') && !v.includes('\\') || 'Must be a folder name, not a path',
};

function close(): void {
  dialog.value = false;
  errorMsg.value = '';
  targetUrl.value = '';
  repoPath.value = '';
  configPath.value = '';
}

async function submit(): Promise<void> {
  const validation = await formRef.value?.validate();
  if (!validation?.valid) return;

  submitting.value = true;
  errorMsg.value = '';

  try {
    await createScan({
      targetUrl: targetUrl.value,
      repoPath: repoPath.value,
      configPath: configPath.value || undefined,
    });
    close();
    emit('created');
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    submitting.value = false;
  }
}
</script>
