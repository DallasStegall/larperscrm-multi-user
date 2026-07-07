/**
 * LarpersCRM — Settings
 *
 * Profile (full_name, phone, npn) and reminder preferences, persisted to the
 * agent's own profiles row via db.updateProfile() (RLS-scoped to auth.uid()).
 *
 * The reminder-preference columns are added by reminders-migration.sql. Until
 * that migration is run, those columns don't exist yet: this page still loads
 * (falling back to sensible defaults) and shows a clear note, and the profile
 * fields — which use existing columns — save normally.
 */

(function () {
  // Preference columns added by reminders-migration.sql.
  const PREF_KEYS = [
    'reminder_via_sms',
    'reminder_via_email',
    'reminder_email',
    'reminder_appt_enabled',
    'reminder_appt_lead_minutes',
    'reminder_f2f_enabled',
  ];

  const $ = (id) => document.getElementById(id);

  function showErr(id, msg) {
    const el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
  }
  function clearErr(id) {
    const el = $(id);
    if (!el) return;
    el.textContent = '';
    el.classList.remove('show');
  }

  // Whether the loaded profile actually has the reminder columns yet.
  function prefsColumnsPresent(profile) {
    return profile && Object.prototype.hasOwnProperty.call(profile, 'reminder_via_email');
  }

  function syncApptLeadRow() {
    const enabled = $('setApptEnabled').checked;
    const row = $('apptLeadRow');
    if (row) row.style.display = enabled ? '' : 'none';
  }

  async function loadSettings() {
    clearErr('profileError');
    clearErr('remindersError');

    if (typeof db === 'undefined' || !db.isAuthenticated()) return;

    const email = (db.user && db.user.email) || '';
    $('setEmail').value = email;

    let profile = null;
    try {
      profile = await db.getProfile();
    } catch (e) {
      /* leave fields empty */
    }
    profile = profile || {};

    // Profile fields (existing columns)
    $('setFullName').value = profile.full_name || '';
    $('setPhone').value = profile.phone || '';
    $('setNpn').value = profile.npn || '';

    // Reminder preferences (new columns) — fall back to defaults if absent.
    const hasPrefs = prefsColumnsPresent(profile);
    $('setViaSms').checked = hasPrefs ? !!profile.reminder_via_sms : false;
    $('setViaEmail').checked = hasPrefs ? !!profile.reminder_via_email : true;
    $('setReminderEmail').value = (hasPrefs && profile.reminder_email) ? profile.reminder_email : '';
    $('setReminderEmail').placeholder = email || 'you@email.com';
    $('setApptEnabled').checked = hasPrefs ? profile.reminder_appt_enabled !== false : true;
    $('setApptLead').value = String(hasPrefs && profile.reminder_appt_lead_minutes != null ? profile.reminder_appt_lead_minutes : 1440);
    $('setF2fEnabled').checked = hasPrefs ? profile.reminder_f2f_enabled !== false : true;

    const note = $('remindersMigrationNote');
    if (note) {
      if (hasPrefs) {
        note.style.display = 'none';
      } else {
        note.textContent = 'Reminder preferences aren’t set up in the database yet. You can pick your choices now, but saving them needs the one-time reminders-migration.sql to be run in Supabase first.';
        note.style.display = '';
      }
    }

    syncApptLeadRow();
  }
  window.loadSettings = loadSettings;

  async function saveProfile() {
    clearErr('profileError');
    const btn = $('saveProfileBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const payload = {
      full_name: $('setFullName').value.trim() || null,
      phone: $('setPhone').value.trim() || null,
      npn: $('setNpn').value.trim() || null,
    };

    const result = await db.updateProfile(payload);

    btn.disabled = false;
    btn.textContent = 'Save Profile';

    if (!result.success) {
      showErr('profileError', result.error || 'Could not save your profile. Please try again.');
      return;
    }

    // Keep the rest of the app in sync with the new name.
    if (typeof window.loadSettings === 'function') { /* values already reflect input */ }
    if (payload.full_name) {
      const set = (id, t) => { const el = $(id); if (el) el.textContent = t; };
      set('userNameDisplay', payload.full_name);
      set('userMenuName', payload.full_name);
    }
    if (typeof showToast === 'function') showToast('Profile saved');
  }

  async function saveReminders() {
    clearErr('remindersError');
    const btn = $('saveRemindersBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const payload = {
      reminder_via_sms: $('setViaSms').checked,
      reminder_via_email: $('setViaEmail').checked,
      reminder_email: $('setReminderEmail').value.trim() || null,
      reminder_appt_enabled: $('setApptEnabled').checked,
      reminder_appt_lead_minutes: parseInt($('setApptLead').value, 10) || 1440,
      reminder_f2f_enabled: $('setF2fEnabled').checked,
    };

    const result = await db.updateProfile(payload);

    btn.disabled = false;
    btn.textContent = 'Save Preferences';

    if (!result.success) {
      const raw = String(result.error || '');
      const looksLikeMissingColumn = /column|schema|does not exist|reminder_/i.test(raw);
      showErr('remindersError', looksLikeMissingColumn
        ? 'Couldn’t save — the reminder columns aren’t in the database yet. Run reminders-migration.sql in Supabase, then try again.'
        : (raw || 'Could not save your preferences. Please try again.'));
      return;
    }

    if (typeof showToast === 'function') showToast('Preferences saved');
  }

  function init() {
    const saveProfileBtn = $('saveProfileBtn');
    const saveRemindersBtn = $('saveRemindersBtn');
    const apptToggle = $('setApptEnabled');
    if (!saveProfileBtn && !saveRemindersBtn) return; // settings page not present

    if (saveProfileBtn) saveProfileBtn.addEventListener('click', saveProfile);
    if (saveRemindersBtn) saveRemindersBtn.addEventListener('click', saveReminders);
    if (apptToggle) apptToggle.addEventListener('change', syncApptLeadRow);

    // Also load if the app ever lands directly on the settings page.
    const nav = document.querySelector('.nav-item[data-page="settings"]');
    if (nav) nav.addEventListener('click', loadSettings);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
