/**
 * LarpersCRM — My Carrier Appointments (Carriers page, "My Appointments" tab)
 * Loads, adds, edits, and deletes the logged-in agent's carrier appointments
 * against Supabase (public.carrier_appointments). RLS restricts every
 * request to rows where agent_id = auth.uid().
 */

(function () {
  let appointments = [];
  let editingId = null;

  const STATUS_BADGE_CLASS = {
    active: 'status-badge-success',
    pending: 'status-badge-warning',
    terminated: 'status-badge-danger',
  };

  const loadingEl = () => document.getElementById('carrierApptLoading');
  const emptyEl = () => document.getElementById('carrierApptEmpty');
  const tableWrapEl = () => document.getElementById('carrierApptTableWrap');
  const tableBodyEl = () => document.getElementById('carrierApptTableBody');

  const modalOverlay = () => document.getElementById('carrierApptModalOverlay');
  const modalTitle = () => document.getElementById('carrierApptModalTitle');
  const modalError = () => document.getElementById('carrierApptModalError');
  const form = () => document.getElementById('carrierApptForm');

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function renderRow(a) {
    const status = a.status || 'active';
    return `
      <tr data-id="${a.id}">
        <td>${escapeHtml(a.carrier_name)}</td>
        <td><span class="status-badge ${STATUS_BADGE_CLASS[status] || 'status-badge-neutral'}">${escapeHtml(status)}</span></td>
        <td>${escapeHtml(a.comp) || '—'}</td>
        <td>${escapeHtml(a.upline) || '—'}</td>
        <td>${escapeHtml(a.writing_number) || '—'}</td>
        <td>${escapeHtml(a.imo) || '—'}</td>
        <td>
          <div class="row-actions">
            <button class="row-action-btn carrier-appt-edit-btn" title="Edit" data-id="${a.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </button>
            <button class="row-action-btn carrier-appt-delete-btn" title="Delete" data-id="${a.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderAppointments() {
    loadingEl().style.display = 'none';

    if (!appointments.length) {
      emptyEl().style.display = '';
      tableWrapEl().style.display = 'none';
      return;
    }

    emptyEl().style.display = 'none';
    tableWrapEl().style.display = '';
    tableBodyEl().innerHTML = appointments.map(renderRow).join('');

    tableBodyEl().querySelectorAll('.carrier-appt-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => openModal(btn.dataset.id));
    });
    tableBodyEl().querySelectorAll('.carrier-appt-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => handleDelete(btn.dataset.id));
    });
  }

  async function loadCarrierAppointments() {
    loadingEl().style.display = '';
    emptyEl().style.display = 'none';
    tableWrapEl().style.display = 'none';

    if (typeof db === 'undefined' || !db.isAuthenticated()) {
      appointments = [];
      renderAppointments();
      return;
    }

    appointments = await db.query('carrier_appointments');
    appointments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    renderAppointments();
  }
  window.loadCarrierAppointments = loadCarrierAppointments;

  function resetForm() {
    editingId = null;
    form().reset();
    document.getElementById('carrierApptId').value = '';
    document.getElementById('carrierApptStatus').value = 'active';
    modalError().classList.remove('show');
    modalError().textContent = '';
  }

  function openModal(id) {
    resetForm();

    if (id) {
      const a = appointments.find((x) => String(x.id) === String(id));
      if (!a) return;
      editingId = a.id;
      modalTitle().textContent = 'Edit Appointment';
      document.getElementById('carrierApptId').value = a.id;
      document.getElementById('carrierApptName').value = a.carrier_name || '';
      document.getElementById('carrierApptStatus').value = a.status || 'active';
      document.getElementById('carrierApptComp').value = a.comp || '';
      document.getElementById('carrierApptUpline').value = a.upline || '';
      document.getElementById('carrierApptWritingNumber').value = a.writing_number || '';
      document.getElementById('carrierApptImo').value = a.imo || '';
      document.getElementById('carrierApptNote').value = a.note || '';
    } else {
      modalTitle().textContent = 'Add Appointment';
    }

    modalOverlay().style.display = 'flex';
  }

  function closeModal() {
    modalOverlay().style.display = 'none';
    resetForm();
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const carrierName = document.getElementById('carrierApptName').value.trim();
    if (!carrierName) return;

    const payload = {
      carrier_name: carrierName,
      status: document.getElementById('carrierApptStatus').value,
      comp: document.getElementById('carrierApptComp').value.trim() || null,
      upline: document.getElementById('carrierApptUpline').value.trim() || null,
      writing_number: document.getElementById('carrierApptWritingNumber').value.trim() || null,
      imo: document.getElementById('carrierApptImo').value.trim() || null,
      note: document.getElementById('carrierApptNote').value.trim() || null,
    };

    const submitBtn = document.getElementById('carrierApptSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    const result = editingId
      ? await db.update('carrier_appointments', editingId, payload)
      : await db.insert('carrier_appointments', payload);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Appointment';

    if (!result.success) {
      const errDiv = modalError();
      errDiv.textContent = result.error || 'Something went wrong. Please try again.';
      errDiv.classList.add('show');
      return;
    }

    closeModal();
    await loadCarrierAppointments();
    if (typeof showToast === 'function') {
      showToast(editingId ? 'Appointment updated' : 'Appointment added');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this carrier appointment? This cannot be undone.')) return;
    const result = await db.delete('carrier_appointments', id);
    if (!result.success) {
      if (typeof showToast === 'function') showToast(result.error || 'Delete failed');
      return;
    }
    await loadCarrierAppointments();
    if (typeof showToast === 'function') showToast('Appointment deleted');
  }

  function init() {
    const addBtn = document.getElementById('addAppointmentBtnCarrier');
    if (addBtn) addBtn.addEventListener('click', () => openModal(null));

    const closeBtn = document.getElementById('closeCarrierApptModal');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    const overlay = modalOverlay();
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
    }

    const apptForm = form();
    if (apptForm) apptForm.addEventListener('submit', handleSubmit);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
