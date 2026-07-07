/**
 * LarpersCRM — Topbar (notifications + user menu)
 *
 * Notifications: derived live from the agent's own Supabase data — upcoming
 * appointments, new leads, pending policies, and waiting Face-to-Face
 * sessions. Every query is RLS-scoped to agent_id = auth.uid(), so the panel
 * only ever reflects the signed-in agent's data. "Read" state is remembered
 * per-agent in localStorage so the unread badge behaves sensibly.
 *
 * User menu: shows who's signed in (real name + email from the profile) and
 * provides a working Sign out (db.logout() + reload back to the auth screen).
 */

(function () {
  // ---- icons -------------------------------------------------------------
  const ICONS = {
    appt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>',
    lead: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
    policy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/></svg>',
    f2f: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="14" height="12" rx="2"/></svg>',
  };

  let notifications = [];
  let readSet = new Set();
  let storageKey = null;

  // ---- helpers -----------------------------------------------------------
  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function getInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'A';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function formatDate(d) {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function todayStr() {
    const n = new Date();
    const m = String(n.getMonth() + 1).padStart(2, '0');
    const d = String(n.getDate()).padStart(2, '0');
    return `${n.getFullYear()}-${m}-${d}`;
  }

  // ---- read-state (per agent) -------------------------------------------
  function loadReadSet() {
    const uid = db && db.user ? db.user.id : null;
    storageKey = uid ? `larperscrm_read_notifs_${uid}` : null;
    readSet = new Set();
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) JSON.parse(raw).forEach((id) => readSet.add(id));
    } catch (e) {
      /* ignore corrupt storage */
    }
  }

  function saveReadSet() {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(readSet)));
    } catch (e) {
      /* ignore quota/availability errors */
    }
  }

  // ---- build notifications from real data --------------------------------
  async function buildNotifications() {
    if (typeof db === 'undefined' || !db.isAuthenticated()) {
      notifications = [];
      return;
    }

    let appts = [], leads = [], policies = [], sessions = [];
    try {
      [appts, leads, policies, sessions] = await Promise.all([
        db.query('appointments'),
        db.query('leads'),
        db.query('policies'),
        db.query('f2f_sessions'),
      ]);
    } catch (e) {
      notifications = [];
      return;
    }

    const today = todayStr();
    const items = [];

    (appts || [])
      .filter((a) => a.appt_date && a.appt_date >= today)
      .sort((a, b) => `${a.appt_date}${a.appt_time || ''}`.localeCompare(`${b.appt_date}${b.appt_time || ''}`))
      .forEach((a) => items.push({
        id: 'appt:' + a.id,
        page: 'calendar',
        icon: ICONS.appt,
        title: a.title,
        sub: 'Upcoming appointment · ' + formatDate(a.appt_date),
      }));

    (leads || [])
      .filter((l) => (l.stage || 'new') === 'new')
      .forEach((l) => items.push({
        id: 'lead:' + l.id,
        page: 'leads',
        icon: ICONS.lead,
        title: l.name,
        sub: 'New lead — needs a first call',
      }));

    (policies || [])
      .filter((p) => (p.status || 'pending') === 'pending')
      .forEach((p) => items.push({
        id: 'policy:' + p.id,
        page: 'policies',
        icon: ICONS.policy,
        title: p.carrier || 'Policy',
        sub: 'Policy pending' + (p.product ? ' · ' + p.product : ''),
      }));

    (sessions || [])
      .filter((s) => (s.status || 'waiting') === 'waiting')
      .forEach((s) => items.push({
        id: 'f2f:' + s.id,
        page: 'facetoface',
        icon: ICONS.f2f,
        title: s.client_name,
        sub: 'Face-to-Face session waiting',
      }));

    notifications = items;
  }

  function unreadCount() {
    return notifications.filter((n) => !readSet.has(n.id)).length;
  }

  // ---- rendering ---------------------------------------------------------
  function updateBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    const count = unreadCount();
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  function renderList() {
    const list = document.getElementById('notifList');
    const markAll = document.getElementById('notifMarkAll');
    if (!list) return;

    if (!notifications.length) {
      list.innerHTML = '<div class="notif-empty">You\'re all caught up — no notifications right now.</div>';
      if (markAll) markAll.disabled = true;
      return;
    }

    if (markAll) markAll.disabled = unreadCount() === 0;

    list.innerHTML = notifications.map((n) => `
      <button class="notif-item ${readSet.has(n.id) ? '' : 'unread'}" data-id="${escapeHtml(n.id)}" data-page="${escapeHtml(n.page)}">
        <span class="notif-item-icon">${n.icon}</span>
        <span class="notif-item-body">
          <span class="notif-item-title">${escapeHtml(n.title)}</span>
          <span class="notif-item-sub">${escapeHtml(n.sub)}</span>
        </span>
      </button>
    `).join('');

    list.querySelectorAll('.notif-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        readSet.add(btn.dataset.id);
        saveReadSet();
        closeAll();
        if (typeof showPage === 'function' && btn.dataset.page) showPage(btn.dataset.page);
        updateBadge();
      });
    });
  }

  // ---- popover open/close ------------------------------------------------
  function closeAll() {
    ['notifPopover', 'userMenuPopover'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const nb = document.getElementById('notifBtn');
    const ub = document.getElementById('userMenuBtn');
    if (nb) nb.setAttribute('aria-expanded', 'false');
    if (ub) ub.setAttribute('aria-expanded', 'false');
  }

  let notifLoading = false;

  async function toggleNotif() {
    const pop = document.getElementById('notifPopover');
    const btn = document.getElementById('notifBtn');
    if (!pop) return;

    // Decide open-vs-close synchronously so the bell stays a reliable toggle
    // even while a refresh is in flight (no async gap before the visibility flip).
    const isOpen = pop.style.display !== 'none';
    closeAll();
    if (isOpen) return; // was open → closeAll() closed it; done.

    // Open immediately with whatever we already have, then refresh in the
    // background. A second click during the refresh sees the panel as open and
    // closes it; the in-flight guard prevents overlapping Supabase fetches.
    renderList();
    updateBadge();
    pop.style.display = '';
    if (btn) btn.setAttribute('aria-expanded', 'true');

    if (notifLoading) return;
    notifLoading = true;
    try {
      await buildNotifications();
    } finally {
      notifLoading = false;
    }
    // Only re-render the list if the panel is still open; always refresh the badge.
    if (pop.style.display !== 'none') renderList();
    updateBadge();
  }

  function toggleUserMenu() {
    const pop = document.getElementById('userMenuPopover');
    const btn = document.getElementById('userMenuBtn');
    if (!pop) return;
    const isOpen = pop.style.display !== 'none';
    closeAll();
    if (!isOpen) {
      pop.style.display = '';
      if (btn) btn.setAttribute('aria-expanded', 'true');
    }
  }

  // ---- user identity in the menu header ---------------------------------
  async function populateUserMenu() {
    let fullName = '';
    let role = 'Agent';

    try {
      const profile = await db.getProfile();
      if (profile) {
        if (profile.full_name) fullName = String(profile.full_name).trim();
        if (profile.role) role = String(profile.role).trim();
      }
    } catch (e) {
      /* fall through to metadata */
    }

    if (!fullName && db.user) {
      const meta = db.user.user_metadata || db.user.raw_user_meta_data || {};
      fullName = (meta.full_name && String(meta.full_name).trim()) ||
        (db.user.email ? db.user.email.split('@')[0] : '') || '';
    }
    if (!fullName) fullName = 'Agent';

    const email = (db.user && db.user.email) || '';
    const initials = getInitials(fullName);

    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    // Menu header
    set('userMenuName', fullName);
    set('userMenuEmail', email || '—');
    set('userMenuAvatar', initials);
    // Topbar button (personalize.js also targets these; keep them correct regardless of load order)
    set('userNameDisplay', fullName);
    set('userAvatar', initials);
    set('userRoleDisplay', role);
  }

  async function handleSignOut() {
    try {
      db.logout();
    } catch (e) {
      /* logout is best-effort; clearing below still happens */
    }
    // Reload so auth-screens.js re-runs and shows the login screen.
    window.location.reload();
  }

  // ---- init --------------------------------------------------------------
  async function init() {
    const notifBtn = document.getElementById('notifBtn');
    const userBtn = document.getElementById('userMenuBtn');
    const markAll = document.getElementById('notifMarkAll');
    const signOut = document.getElementById('userMenuSignOut');
    if (!notifBtn || !userBtn) return; // topbar not present

    notifBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleNotif(); });
    userBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleUserMenu(); });

    if (markAll) {
      markAll.addEventListener('click', (e) => {
        e.stopPropagation();
        notifications.forEach((n) => readSet.add(n.id));
        saveReadSet();
        renderList();
        updateBadge();
      });
    }

    if (signOut) signOut.addEventListener('click', (e) => { e.stopPropagation(); handleSignOut(); });

    const settingsItem = document.getElementById('userMenuSettings');
    if (settingsItem) {
      settingsItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAll();
        if (typeof showPage === 'function') showPage('settings');
        if (typeof window.loadSettings === 'function') window.loadSettings();
      });
    }

    // Close on outside click / Escape
    document.addEventListener('click', (e) => {
      const nw = document.getElementById('notifWrap');
      const uw = document.getElementById('userMenuWrap');
      if (nw && nw.contains(e.target)) return;
      if (uw && uw.contains(e.target)) return;
      closeAll();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });

    // Wait for the session to be restored, then load identity + initial badge.
    let tries = 0;
    while ((typeof db === 'undefined' || !db.isAuthenticated()) && tries < 60) {
      await new Promise((r) => setTimeout(r, 100));
      tries++;
    }
    if (typeof db === 'undefined' || !db.isAuthenticated()) return;

    loadReadSet();
    await populateUserMenu();
    await buildNotifications();
    updateBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
