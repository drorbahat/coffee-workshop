// admin-registrations-ui.js
// Entry point for the admin registrations UI.
// Delegates to the modular admin-ui/ modules.
import { renderAdminShell } from './admin-ui/page.js';

export function renderRegistrationsAdminPage() {
  return renderAdminShell();
}
