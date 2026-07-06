/**
 * LarpersCRM — Face to Face
 * Loads, creates, ends, and deletes the logged-in agent's F2F sessions
 * against Supabase (public.f2f_sessions). RLS restricts every request to
 * rows where agent_id = auth.uid(). Actual video/email/SMS delivery is not
 * wired up yet — this only persists session records so agents can track them.
 */

(function () {
  let sessions = [];

  const loadingEl = () => document.getElementById('f2fLoading');
  const emptyEl = () => document.getElementById('f2fEmpty');
  const tableWrapEl = () => document.getElementById('f2fTableWrap');
  const tableBodyEl = () => document.getElementById('f2fTableBody');

  const modalOverlay = () => document.getElementById('f2fModalOverlay');
  const modalError = () => document.getElementById('f2fModalError');
  const form = () => document.getElementById('f2fForm');

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function renderRow(s) {
    const isWaiting = (s.status || 'waiting') === 'waiting';
    return `
      <tr data-id="${s.id}">
        <td>${escapeHtml(s.client_name)}</td>
        <td style="text-transform:capitalize;">${escapeHtml(s.method) || '—'}</td>
        <td>${escapeHtml(s.contact) || '—'}</td>
        <td><span class="status-badge ${isWaiting ? 'status-badge-warning' : 'status-badge-neutral'}">${escapeHtml(s.status || 'waiting')}</span></td>
        <td>
          <div class="row-actions">
            ${isWaiting ? `<button class="row-action-btn f2f-end-btn" title="Mark Ended" data-id="${s.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
            </button>` : ''}
            <button class="row-action-btn f2f-delete-btn" title="Delete" data-id="${s.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderSessions() {
    loadingEl().style.display = 'none';

    if (!sessions.length) {
      emptyEl().style.display = '';
      tableWrapEl().style.display = 'none';
      return;
    }

    emptyEl().style.display = 'none';
    tableWrapEl().style.display = '';
    tableBodyEl().innerHTML = sessions.map(renderRow).join('');

    tableBodyEl().querySelectorAll('.f2f-end-btn').forEach((btn) => {
      btn.addEventListener('click', () => handleEnd(btn.dataset.id));
    });
    tableBodyEl().querySelectorAll('.f2f-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => handleDelete(btn.dataset.id));
    });
  }

  async function loadSessions() {
    loadingEl().style.display = '';
    emptyEl().style.display = 'none';
    tableWrapEl().style.display = 'none';

    if (typeof db === 'undefined' || !db.isAuthenticated()) {
      sessions = [];
      renderSessions();
      return;
    }

    sessions = await db.query('f2f_sessions');
    sessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    renderSessions();
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

    const clientName = document.getElementById('f2fClientName').value.trim();
    const contact = document.getElementById('f2fContact').value.trim();
    if (!clientName || !contact) return;

    const payload = {
      client_name: clientName,
      method: document.getElementById('f2fMethod').value,
      contact,
      status: 'waiting',
    };

    const submitBtn = document.getElementById('f2fSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    const result = await db.insert('f2f_sessions', payload);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Session';

    if (!result.success) {
      const errDiv = modalError();
      errDiv.textContent = result.error || 'Something went wrong. Please try again.';
      errDiv.classList.add('show');
      return;
    }

    closeModal();
    await loadSessions();
    if (typeof showToast === 'function') showToast('Session scheduled');
  }

  async function handleEnd(id) {
    const result = await db.update('f2f_sessions', id, { status: 'ended' });
    if (!result.success) {
      if (typeof showToast === 'function') showToast(result.error || 'Update failed');
      return;
    }
    await loadSessions();
    if (typeof showToast === 'function') showToast('Session marked ended');
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this session? This cannot be undone.')) return;
    const result = await db.delete('f2f_sessions', id);
    if (!result.success) {
      if (typeof showToast === 'function') showToast(result.error || 'Delete failed');
      return;
    }
    await loadSessions();
    if (typeof showToast === 'function') showToast('Session deleted');
  }

  function init() {
    const scheduleBtn = document.getElementById('scheduleSessionBtn');
    if (scheduleBtn) scheduleBtn.addEventListener('click', openModal);

    const instantBtn = document.getElementById('startInstantMeetingBtn');
    if (instantBtn) {
      instantBtn.addEventListener('click', () => {
        if (typeof showToast === 'function') {
          showToast('Instant video meetings are coming soon.');
        }
      });
    }

    const closeBtn = document.getElementById('closeF2fModal');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    const overlay = modalOverlay();
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
    }

    const f2fForm = form();
    if (f2fForm) f2fForm.addEventListener('submit', handleSubmit);

    const f2fNavItem = document.querySelector('.nav-item[data-page="facetoface"]');
    if (f2fNavItem) {
      f2fNavItem.addEventListener('click', () => loadSessions());
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
