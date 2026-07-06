/**
 * LarpersCRM — My Leads
 * Loads, adds, edits, and deletes the logged-in agent's leads against
 * Supabase (public.leads). RLS restricts every request to rows where
 * agent_id = auth.uid(), so agents only ever see their own leads.
 */

(function () {
  let leads = [];
  let editingId = null;

  const STAGE_LABELS = {
    new: 'New',
    contacted: 'Contacted',
    appointment_set: 'Appointment Set',
    sold: 'Sold',
    not_interested: 'Not Interested',
    dnc: 'Do Not Call',
  };

  const STAGE_BADGE_CLASS = {
    new: 'status-badge-neutral',
    contacted: 'status-badge-warning',
    appointment_set: 'status-badge-warning',
    sold: 'status-badge-success',
    not_interested: 'status-badge-danger',
    dnc: 'status-badge-danger',
  };

  const loadingEl = () => document.getElementById('leadsLoading');
  const emptyEl = () => document.getElementById('leadsEmpty');
  const tableWrapEl = () => document.getElementById('leadsTableWrap');
  const tableBodyEl = () => document.getElementById('leadsTableBody');

  const modalOverlay = () => document.getElementById('leadModalOverlay');
  const modalTitle = () => document.getElementById('leadModalTitle');
  const modalError = () => document.getElementById('leadModalError');
  const form = () => document.getElementById('leadForm');

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function renderRow(l) {
    const stage = l.stage || 'new';
    return `
      <tr data-id="${l.id}">
        <td>${escapeHtml(l.name)}</td>
        <td>${escapeHtml(l.phone) || '—'}</td>
        <td>${escapeHtml(l.email) || '—'}</td>
        <td><span class="status-badge ${STAGE_BADGE_CLASS[stage] || 'status-badge-neutral'}">${escapeHtml(STAGE_LABELS[stage] || stage)}</span></td>
        <td>${escapeHtml(l.source) || '—'}</td>
        <td>
          <div class="row-actions">
            <button class="row-action-btn lead-edit-btn" title="Edit" data-id="${l.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </button>
            <button class="row-action-btn lead-delete-btn" title="Delete" data-id="${l.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderLeads() {
    loadingEl().style.display = 'none';

    if (!leads.length) {
      emptyEl().style.display = '';
      tableWrapEl().style.display = 'none';
      return;
    }

    emptyEl().style.display = 'none';
    tableWrapEl().style.display = '';
    tableBodyEl().innerHTML = leads.map(renderRow).join('');

    tableBodyEl().querySelectorAll('.lead-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => openModal(btn.dataset.id));
    });
    tableBodyEl().querySelectorAll('.lead-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => handleDelete(btn.dataset.id));
    });
  }

  async function loadLeads() {
    loadingEl().style.display = '';
    emptyEl().style.display = 'none';
    tableWrapEl().style.display = 'none';

    if (typeof db === 'undefined' || !db.isAuthenticated()) {
      leads = [];
      renderLeads();
      return;
    }

    leads = await db.query('leads');
    leads.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    renderLeads();
  }

  function resetForm() {
    editingId = null;
    form().reset();
    document.getElementById('leadId').value = '';
    document.getElementById('leadStage').value = 'new';
    modalError().classList.remove('show');
    modalError().textContent = '';
  }

  function openModal(id) {
    resetForm();

    if (id) {
      const l = leads.find((x) => String(x.id) === String(id));
      if (!l) return;
      editingId = l.id;
      modalTitle().textContent = 'Edit Lead';
      document.getElementById('leadId').value = l.id;
      document.getElementById('leadName').value = l.name || '';
      document.getElementById('leadPhone').value = l.phone || '';
      document.getElementById('leadEmail').value = l.email || '';
      document.getElementById('leadStage').value = l.stage || 'new';
      document.getElementById('leadSource').value = l.source || '';
    } else {
      modalTitle().textContent = 'Add Lead';
    }

    modalOverlay().style.display = 'flex';
  }

  function closeModal() {
    modalOverlay().style.display = 'none';
    resetForm();
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('leadName').value.trim();
    if (!name) return;

    const payload = {
      name,
      phone: document.getElementById('leadPhone').value.trim() || null,
      email: document.getElementById('leadEmail').value.trim() || null,
      stage: document.getElementById('leadStage').value,
      source: document.getElementById('leadSource').value.trim() || null,
    };

    const submitBtn = document.getElementById('leadSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    const result = editingId
      ? await db.update('leads', editingId, payload)
      : await db.insert('leads', payload);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Lead';

    if (!result.success) {
      const errDiv = modalError();
      errDiv.textContent = result.error || 'Something went wrong. Please try again.';
      errDiv.classList.add('show');
      return;
    }

    closeModal();
    await loadLeads();
    if (typeof showToast === 'function') {
      showToast(editingId ? 'Lead updated' : 'Lead added');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this lead? This cannot be undone.')) return;
    const result = await db.delete('leads', id);
    if (!result.success) {
      if (typeof showToast === 'function') showToast(result.error || 'Delete failed');
      return;
    }
    await loadLeads();
    if (typeof showToast === 'function') showToast('Lead deleted');
  }

  function init() {
    const addBtn = document.getElementById('addLeadBtn');
    if (addBtn) addBtn.addEventListener('click', () => openModal(null));

    const closeBtn = document.getElementById('closeLeadModal');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    const overlay = modalOverlay();
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
    }

    const leadForm = form();
    if (leadForm) leadForm.addEventListener('submit', handleSubmit);

    const leadsNavItem = document.querySelector('.nav-item[data-page="leads"]');
    if (leadsNavItem) {
      leadsNavItem.addEventListener('click', () => loadLeads());
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
