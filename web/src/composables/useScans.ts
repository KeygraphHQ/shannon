import { ref, onMounted, onUnmounted } from 'vue';
import { listScans, syncAllScans, type Scan } from '../api';

export function useScans() {
  const scans = ref<Scan[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function fetchScans(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      scans.value = await listScans();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function syncAndRefresh(): Promise<void> {
    try {
      await syncAllScans();
      await fetchScans();
    } catch {
      // Sync failures are non-critical; keep showing stale data
    }
  }

  function startPolling(intervalMs = 10_000): void {
    stopPolling();
    pollTimer = setInterval(async () => {
      const hasRunning = scans.value.some((s) => s.status === 'running');
      if (hasRunning) {
        await syncAndRefresh();
      }
    }, intervalMs);
  }

  function stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  onMounted(async () => {
    await fetchScans();
    await syncAndRefresh();
    startPolling();
  });

  onUnmounted(() => {
    stopPolling();
  });

  return { scans, loading, error, fetchScans, syncAndRefresh };
}
