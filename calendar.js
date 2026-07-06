/**
 * LarpersCRM — My Calendar
 * Loads, adds, edits, and deletes the logged-in agent's appointments against
 * Supabase (public.appointments). RLS restricts every request to rows where
 * agent_id = auth.uid(), so agents only ever see their own appointments.
 */

(function () {
  let appointments = [];
  let editingId = null;

  const loadingEl = () => document.getElementById('apptsLoading');
  const emptyEl = () => document.getElementById('apptsEmpty');
  const tableWrapEl = () => document.getElementById('apptsTableWrap');
  const tableBodyEl = () => document.getElementById('apptsTableBody');

  const modalOverlay = () => document.getElementById('apptModalOverlay');
  const modalTitle = () => document.getElementById('apptModalTitle');
  const modalError = () => document.getElementById('apptModalError');
  const form = () => document.getElementById('apptForm');

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function formatDate(d) {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatTime(t) {
    if (!t) return '—';
    const [h, m] = t.split(':');
    const hour = parseInt(h, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12}:${m} ${period}`;
  }

  function renderRow(a) {
    return `
      <tr data-id="${a.id}">
        <td>${escapeHtml(a.title)}</td>
        <td>${formatDate(a.appt_date)}</td>
        <td>${formatTime(a.appt_time)}</td>
        <td>${escapeHtml(a.notes) || '—'}</td>
        <td>
          <div class="row-actions">
            <button class="row-action-btn appt-edit-btn" title="Edit" data-id="${a.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </button>
            <button class="row-action-btn appt-delete-btn" title="Delete" data-id="${a.id}">
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

    tableBodyEl().querySelectorAll('.appt-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => openModal(btn.dataset.id));
    });
    tableBodyEl().querySelectorAll('.appt-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => handleDelete(btn.dataset.id));
    });
  }

  async function loadAppointments() {
    loadingEl().style.display = '';
    emptyEl().style.display = 'none';
    tableWrapEl().style.display = 'none';

    if (typeof db === 'undefined' || !db.isAuthenticated()) {
      appointments = [];
      renderAppointments();
      return;
    }

    appointments = await db.query('appointments');
    appointments.sort((a, b) => {
      const da = `${a.appt_date || ''}T${a.appt_time || '00:00'}`;
      const dbb = `${b.appt_date || ''}T${b.appt_time || '00:00'}`;
      return da.localeCompare(dbb);
    });
    renderAppointments();
  }

  function resetForm() {
    editingId = null;
    form().reset();
    document.getElementById('apptId').value = '';
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
      document.getElementById('apptId').value = a.id;
      document.getElementById('apptTitle').value = a.title || '';
      document.getElementById('apptDate').value = a.appt_date || '';
      document.getElementById('apptTime').value = a.appt_time || '';
      document.getElementById('apptNotes').value = a.notes || '';
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

    const title = document.getElementById('apptTitle').value.trim();
    const apptDate = document.getElementById('apptDate').value;
    if (!title || !apptDate) return;

    const payload = {
      title,
      appt_date: apptDate,
      appt_time: document.getElementById('apptTime').value || null,
      notes: document.getElementById('apptNotes').value.trim() || null,
    };

    const submitBtn = document.getElementById('apptSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    const result = editingId
      ? await db.update('appointments', editingId, payload)
      : await db.insert('appointments', payload);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Appointment';

    if (!result.success) {
      const errDiv = modalError();
      errDiv.textContent = result.error || 'Something went wrong. Please try again.';
      errDiv.classList.add('show');
      return;
    }

    closeModal();
    await loadAppointments();
    if (typeof showToast === 'function') {
      showToast(editingId ? 'Appointment updated' : 'Appointment added');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this appointment? This cannot be undone.')) return;
    const result = await db.delete('appointments', id);
    if (!result.success) {
      if (typeof showToast === 'function') showToast(result.error || 'Delete failed');
      return;
    }
    await loadAppointments();
    if (typeof showToast === 'function') showToast('Appointment deleted');
  }

  function init() {
    const addBtn = document.getElementById('addAppointmentBtn');
    if (addBtn) addBtn.addEventListener('click', () => openModal(null));

    const closeBtn = document.getElementById('closeApptModal');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    const overlay = modalOverlay();
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
    }

    const apptForm = form();
    if (apptForm) apptForm.addEventListener('submit', handleSubmit);

    const calendarNavItem = document.querySelector('.nav-item[data-page="calendar"]');
    if (calendarNavItem) {
      calendarNavItem.addEventListener('click', () => loadAppointments());
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
