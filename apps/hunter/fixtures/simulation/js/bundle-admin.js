// Simulated production bundle for the admin panel (offline fixture — not real code)
const internalConfig = { metricsHost: 'db-primary.internal' };

const featureFlags = { newAdminTable: true, exportCsv: false };

// NOTE: this looks like a leaked fixture credential, intentionally fake, for
// the js-intelligence secret-detection demo — it is not a real AWS key.
const debugToken = 'AKIAABCDEFGHIJKLMNOP';

function loadUsers() {
  return fetch('/internal/admin/users').then((r) => r.json());
}
