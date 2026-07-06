/**
 * LarpersCRM — My Policies
 * Loads, adds, edits, and deletes the logged-in agent's policies against
 * Supabase (public.policies). RLS on that table already restricts every
 * request to rows where agent_id = auth.uid(), so agents only ever see
 * their own policies.
 */

(function () {
  let policies = [];
  let editingId = null;

  const loadingEl = () => document.getElementById('policiesLoading');
  const emptyEl = () => document.getElementById('policiesEmpty');
  const tableWrapEl = () => document.getElementById('policiesTableWrap');
  const tableBodyEl = () => document.getElementById('policiesTableBody');

  const modalOverlay = () => document.getElementById('policyModalOverlay');
  const modalTitle = () => document.getElementById('policyModalTitle');
  const modalError = () => document.getElementById('policyModalError');
  const form = () => document.getElementById('policyForm');

  function money(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  function formatDate(d) {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function renderRow(p) {
    return `
      <tr data-id="${p.id}">
        <td>${escapeHtml(p.carrier)}</td>
        <td>${escapeHtml(p.product) || '—'}</td>
        <td><span class="policy-status-badge policy-status-${escapeHtml(p.status || 'pending')}">${escapeHtml(p.status || 'pending')}</span></td>
        <td>${escapeHtml(p.policy_number) || '—'}</td>
        <td>${money(p.monthly_premium)}</td>
        <td>${money(p.face_amount)}</td>
        <td>${formatDate(p.sale_date)}</td>
        <td>
          <div class="policy-row-actions">
            <button class="policy-row-btn policy-edit-btn" title="Edit" data-id="${p.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </button>
            <button class="policy-row-btn policy-delete-btn" title="Delete" data-id="${p.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderPolicies() {
    loadingEl().style.display = 'none';

    if (!policies.length) {
      emptyEl().style.display = '';
      tableWrapEl().style.display = 'none';
      return;
    }

    emptyEl().style.display = 'none';
    tableWrapEl().style.display = '';
    tableBodyEl().innerHTML = policies.map(renderRow).join('');

    tableBodyEl().querySelectorAll('.policy-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => openModal(btn.dataset.id));
    });
    tableBodyEl().querySelectorAll('.policy-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => handleDelete(btn.dataset.id));
    });
  }

  async function loadPolicies() {
    loadingEl().style.display = '';
    emptyEl().style.display = 'none';
    tableWrapEl().style.display = 'none';

    if (typeof db === 'undefined' || !db.isAuthenticated()) {
      policies = [];
      renderPolicies();
      return;
    }

    policies = await db.query('policies');
    // Newest first
    policies.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    renderPolicies();
  }

  function resetForm() {
    editingId = null;
    form().reset();
    document.getElementById('policyId').value = '';
    document.getElementById('policyStatus').value = 'pending';
    modalError().classList.remove('show');
    modalError().textContent = '';
  }

  function openModal(id) {
    resetForm();

    if (id) {
      const p = policies.find((x) => String(x.id) === String(id));
      if (!p) return;
      editingId = p.id;
      modalTitle().textContent = 'Edit Policy';
      document.getElementById('policyId').value = p.id;
      document.getElementById('policyCarrier').value = p.carrier || '';
      document.getElementById('policyProduct').value = p.product || '';
      document.getElementById('policyStatus').value = p.status || 'pending';
      document.getElementById('policyNumber').value = p.policy_number || '';
      document.getElementById('policyMonthlyPremium').value = p.monthly_premium || '';
      document.getElementById('policyFaceAmount').value = p.face_amount || '';
      document.getElementById('policySaleDate').value = p.sale_date || '';
      document.getElementById('policyEffectiveDate').value = p.effective_date || '';
    } else {
      modalTitle().textContent = 'Add Policy';
    }

    modalOverlay().style.display = 'flex';
  }

  function closeModal() {
    modalOverlay().style.display = 'none';
    resetForm();
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const carrier = document.getElementById('policyCarrier').value.trim();
    if (!carrier) return;

    const monthlyPremium = parseFloat(document.getElementById('policyMonthlyPremium').value) || 0;

    const payload = {
      carrier,
      product: document.getElementById('policyProduct').value.trim() || null,
      status: document.getElementById('policyStatus').value,
      policy_number: document.getElementById('policyNumber').value.trim() || null,
      monthly_premium: monthlyPremium,
      annual_premium: Math.round(monthlyPremium * 12 * 100) / 100,
      face_amount: parseFloat(document.getElementById('policyFaceAmount').value) || 0,
      sale_date: document.getElementById('policySaleDate').value || null,
      effective_date: document.getElementById('policyEffectiveDate').value || null,
    };

    const submitBtn = document.getElementById('policySubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    const result = editingId
      ? await db.update('policies', editingId, payload)
      : await db.insert('policies', payload);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Policy';

    if (!result.success) {
      const errDiv = modalError();
      errDiv.textContent = result.error || 'Something went wrong. Please try again.';
      errDiv.classList.add('show');
      return;
    }

    closeModal();
    await loadPolicies();
    if (typeof showToast === 'function') {
      showToast(editingId ? 'Policy updated' : 'Policy added');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this policy? This cannot be undone.')) return;
    const result = await db.delete('policies', id);
    if (!result.success) {
      if (typeof showToast === 'function') showToast(result.error || 'Delete failed');
      return;
    }
    await loadPolicies();
    if (typeof showToast === 'function') showToast('Policy deleted');
  }

  function init() {
    const addBtn = document.getElementById('addPolicyBtn');
    if (addBtn) addBtn.addEventListener('click', () => openModal(null));

    const closeBtn = document.getElementById('closePolicyModal');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    const overlay = modalOverlay();
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
    }

    const policyForm = form();
    if (policyForm) policyForm.addEventListener('submit', handleSubmit);

    const policiesNavItem = document.querySelector('.nav-item[data-page="policies"]');
    if (policiesNavItem) {
      policiesNavItem.addEventListener('click', () => loadPolicies());
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
