/**
 * LarpersCRM — Integrations
 * Loads, creates, toggles, and deletes the logged-in agent's integration
 * tokens against Supabase (public.integrations). RLS restricts every
 * request to rows where agent_id = auth.uid().
 *
 * Note: this only manages tokens. There is no live webhook receiver yet —
 * inbound lead delivery is a separate backend piece to be built later.
 */

(function () {
  let integrations = [];

  const loadingEl = () => document.getElementById('integrationsLoading');
  const emptyEl = () => document.getElementById('integrationsEmpty');
  const tableWrapEl = () => document.getElementById('integrationsTableWrap');
  const tableBodyEl = () => document.getElementById('integrationsTableBody');

  const modalOverlay = () => document.getElementById('integrationModalOverlay');
  const modalError = () => document.getElementById('integrationModalError');
  const form = () => document.getElementById('integrationForm');

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function generateToken() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return 'whk_' + window.crypto.randomUUID().replace(/-/g, '');
    }
    // Fallback for environments without crypto.randomUUID
    return 'whk_' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  function renderRow(i) {
    return `
      <tr data-id="${i.id}">
        <td>${escapeHtml(i.name)}</td>
        <td><code style="font-size:11.5px; color:var(--text2);">${escapeHtml(i.webhook_token)}</code></td>
        <td><span class="status-badge ${i.active ? 'status-badge-success' : 'status-badge-neutral'}">${i.active ? 'active' : 'inactive'}</span></td>
        <td>
          <div class="row-actions">
            <button class="row-action-btn integration-copy-btn" title="Copy token" data-token="${escapeHtml(i.webhook_token)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            </button>
            <button class="row-action-btn integration-toggle-btn" title="${i.active ? 'Deactivate' : 'Activate'}" data-id="${i.id}" data-active="${i.active}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
            </button>
            <button class="row-action-btn integration-delete-btn" title="Delete" data-id="${i.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderIntegrations() {
    loadingEl().style.display = 'none';

    if (!integrations.length) {
      emptyEl().style.display = '';
      tableWrapEl().style.display = 'none';
      return;
    }

    emptyEl().style.display = 'none';
    tableWrapEl().style.display = '';
    tableBodyEl().innerHTML = integrations.map(renderRow).join('');

    tableBodyEl().querySelectorAll('.integration-copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => handleCopy(btn.dataset.token));
    });
    tableBodyEl().querySelectorAll('.integration-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => handleToggle(btn.dataset.id, btn.dataset.active === 'true'));
    });
    tableBodyEl().querySelectorAll('.integration-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => handleDelete(btn.dataset.id));
    });
  }

  async function loadIntegrations() {
    loadingEl().style.display = '';
    emptyEl().style.display = 'none';
    tableWrapEl().style.display = 'none';

    if (typeof db === 'undefined' || !db.isAuthenticated()) {
      integrations = [];
      renderIntegrations();
      return;
    }

    integrations = await db.query('integrations');
    integrations.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    renderIntegrations();
  }

  function resetForm() {
    form().reset();
    modalError().classList.remove('show');
    modalError().textContent = '';
  }

  function openModal() {
    resetForm();
    modalOverlay().style.display = 'flex';
  }

  function closeModal() {
    modalOverlay().style.display = 'none';
    resetForm();
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('integrationName').value.trim();
    if (!name) return;

    const payload = {
      name,
      webhook_token: generateToken(),
      active: true,
    };

    const submitBtn = document.getElementById('integrationSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating...';

    const result = await db.insert('integrations', payload);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Generate Token';

    if (!result.success) {
      const errDiv = modalError();
      errDiv.textContent = result.error || 'Something went wrong. Please try again.';
      errDiv.classList.add('show');
      return;
    }

    closeModal();
    await loadIntegrations();
    if (typeof showToast === 'function') showToast('Integration created');
  }

  async function handleCopy(token) {
    try {
      await navigator.clipboard.writeText(token);
      if (typeof showToast === 'function') showToast('Token copied to clipboard');
    } catch (e) {
      if (typeof showToast === 'function') showToast('Could not copy token');
    }
  }

  async function handleToggle(id, currentlyActive) {
    const result = await db.update('integrations', id, { active: !currentlyActive });
    if (!result.success) {
      if (typeof showToast === 'function') showToast(result.error || 'Update failed');
      return;
    }
    await loadIntegrations();
    if (typeof showToast === 'function') showToast(currentlyActive ? 'Integration deactivated' : 'Integration activated');
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this integration? This cannot be undone.')) return;
    const result = await db.delete('integrations', id);
    if (!result.success) {
      if (typeof showToast === 'function') showToast(result.error || 'Delete failed');
      return;
    }
    await loadIntegrations();
    if (typeof showToast === 'function') showToast('Integration deleted');
  }

  function init() {
    const addBtn = document.getElementById('addIntegrationBtn');
    if (addBtn) addBtn.addEventListener('click', openModal);

    const closeBtn = document.getElementById('closeIntegrationModal');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    const overlay = modalOverlay();
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
    }

    const integrationForm = form();
    if (integrationForm) integrationForm.addEventListener('submit', handleSubmit);

    const integrationsNavItem = document.querySelector('.nav-item[data-page="integrations"]');
    if (integrationsNavItem) {
      integrationsNavItem.addEventListener('click', () => loadIntegrations());
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
