/**
 * LarpersCRM Personalization
 *
 * After an agent logs in, this fills their real name into the dashboard:
 *  - Top-right user name + avatar initials
 *  - "Good morning, <Name>" greeting (time-aware)
 *  - HCMS "Welcome back" banner
 *  - Larpers Intelligence chatbot greeting
 *  - Agent-name fields on document forms
 *  - Today's date on the dashboard
 *
 * The name comes from the agent's Supabase profile (full_name), which is
 * created automatically on signup. Each agent sees only their own name.
 */

(function () {
  // --- small helpers ---------------------------------------------------------

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (el && 'value' in el) el.value = value;
  }

  function getInitials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'A';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function getGreetingTime() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function getTodayString() {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  // --- main ------------------------------------------------------------------

  async function personalizeApp() {
    // Wait for the Supabase client to exist and restore the session (up to ~6s)
    let tries = 0;
    while ((typeof db === 'undefined' || !db.isAuthenticated()) && tries < 60) {
      await new Promise((r) => setTimeout(r, 100));
      tries++;
    }

    // Not logged in — the auth screen is handling things; nothing to personalize.
    if (typeof db === 'undefined' || !db.isAuthenticated()) return;

    // Figure out the agent's full name.
    let fullName = '';

    // 1) Prefer the profile row (full_name)
    try {
      const profile = await db.getProfile();
      if (profile && profile.full_name) fullName = String(profile.full_name).trim();
    } catch (e) {
      /* ignore, fall through to fallbacks */
    }

    // 2) Fall back to signup metadata, then the email's local part
    if (!fullName && db.user) {
      const meta = db.user.user_metadata || db.user.raw_user_meta_data || {};
      fullName =
        (meta.full_name && String(meta.full_name).trim()) ||
        (db.user.email ? db.user.email.split('@')[0] : '') ||
        '';
    }

    if (!fullName) fullName = 'Agent';

    const firstName = fullName.split(/\s+/)[0];
    const initials = getInitials(fullName);

    // Expose for other parts of the app (e.g. resetting the policy form)
    window.currentAgentName = fullName;
    window.currentAgentFirstName = firstName;

    // --- fill everything in ---
    setText('userNameDisplay', fullName);
    setText('userAvatar', initials);
    setText('greetingName', firstName);
    setText('greetingTime', getGreetingTime());
    setText('hcmsWelcomeName', firstName);
    setText('chatbotGreetingName', firstName);
    setText('hcmsDrawerName', fullName);
    setText('dashboardDate', getTodayString());

    // Agent-name fields used when generating client documents
    setValue('ssnAgentName', fullName);
    setValue('bankAgentName', fullName);
    setValue('appAgentName', fullName);

    // Face-to-Face invite previews (client-facing)
    setText('f2fSubjectAgent', fullName);
    setText('f2fBodyAgent', fullName);
    setText('f2fSmsAgent', fullName);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', personalizeApp);
  } else {
    personalizeApp();
  }
})();