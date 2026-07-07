/**
 * LarpersCRM — Leaderboard
 *
 * Shows real-time sales ranked by Annual Premium (AP) across ALL agents, for a
 * chosen time range. Data lives in the shared public.sales table (every signed-in
 * agent can read all rows; see leaderboard-migration.sql). Sales arrive either
 * from Discord (via the discord-sales Edge Function) or by an agent logging one
 * here. The board polls every 20s while visible so it stays "live".
 */

(function () {
  let sales = [];
  let currentRange = 'today';
  let customFrom = null;
  let customTo = null;
  let pollTimer = null;
  let lastUpdated = 0;
  let loadedOnce = false;

  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function money(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  }

  function currentAgentName() {
    if (window.currentAgentName) return String(window.currentAgentName);
    const meta = (db.user && (db.user.user_metadata || db.user.raw_user_meta_data)) || {};
    if (meta.full_name) return String(meta.full_name);
    if (db.user && db.user.email) return db.user.email.split('@')[0];
    return 'Agent';
  }

  // ---- time ranges -----------------------------------------------------------
  // Bounds are built from calendar components (new Date(y, m, d)) rather than by
  // adding a fixed 24h, so day boundaries stay at true local midnight even
  // across daylight-saving transitions (JS normalizes day overflow correctly).
  function rangeBounds(key) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const dayMs = (yy, mm, dd) => new Date(yy, mm, dd).getTime();

    const today = dayMs(y, m, d);
    const tomorrow = dayMs(y, m, d + 1);

    switch (key) {
      case 'today': return [today, tomorrow];
      case 'yesterday': return [dayMs(y, m, d - 1), today];
      case 'wtd': return [dayMs(y, m, d - now.getDay()), tomorrow]; // week starts Sunday
      case 'mtd': return [dayMs(y, m, 1), tomorrow];
      case 'ytd': return [dayMs(y, 0, 1), tomorrow];
      case 'all': return [0, tomorrow];
      case 'custom': {
        const parse = (s) => { const p = s.split('-').map(Number); return [p[0], p[1] - 1, p[2]]; };
        const start = customFrom ? dayMs(...parse(customFrom)) : 0;
        const [ey, em, ed] = customTo ? parse(customTo) : [y, m, d];
        const end = customTo ? dayMs(ey, em, ed + 1) : tomorrow; // inclusive of the "to" day
        return [start, end];
      }
      default: return [today, tomorrow];
    }
  }

  // ---- aggregation -----------------------------------------------------------
  function aggregate() {
    const [start, end] = rangeBounds(currentRange);
    const groups = new Map();
    let totalAp = 0;
    let salesCount = 0;

    for (const s of sales) {
      const t = s.sold_at ? new Date(s.sold_at).getTime() : NaN;
      if (isNaN(t) || t < start || t >= end) continue;

      const ap = Number(s.ap) || 0;
      const name = (s.agent_name && String(s.agent_name).trim()) || 'Unknown';
      // Group by display name so a person's Discord sales (no agent_id) and
      // CRM-logged sales (with agent_id) merge into one leaderboard row.
      const key = 'name:' + name.toLowerCase().replace(/\s+/g, ' ');

      const g = groups.get(key) || { name, ap: 0, count: 0 };
      g.ap += ap;
      g.count += 1;
      g.name = name; // keep latest display name
      groups.set(key, g);

      totalAp += ap;
      salesCount += 1;
    }

    const ranked = Array.from(groups.values()).sort((a, b) => (b.ap - a.ap) || (b.count - a.count));
    return { ranked, totalAp, salesCount, agents: groups.size };
  }

  function medal(rank) {
    // colored medal for top 3, plain rank number otherwise
    if (rank <= 3) {
      return `<svg class="lb-medal lb-rank-${rank}" viewBox="0 0 24 24" fill="currentColor" stroke="none">`
        + `<path d="M7.5 2h9l-2.2 6.3a5 5 0 1 1-4.6 0L7.5 2Z" opacity="0.25"/>`
        + `<circle cx="12" cy="14" r="6" fill="currentColor"/>`
        + `<text x="12" y="17.5" text-anchor="middle" font-size="7.5" font-weight="800" fill="#0c0e14" font-family="Plus Jakarta Sans, sans-serif">${rank}</text>`
        + `</svg>`;
    }
    return `<span class="lb-rank-num">#${rank}</span>`;
  }

  function render() {
    const { ranked, totalAp, salesCount, agents } = aggregate();

    $('lbTotalAp').textContent = money(totalAp);
    $('lbSalesCount').textContent = String(salesCount);
    $('lbAgentsCount').textContent = String(agents);

    $('lbLoading').style.display = 'none';

    if (!ranked.length) {
      $('lbEmpty').style.display = '';
      $('lbList').style.display = 'none';
    } else {
      $('lbEmpty').style.display = 'none';
      const list = $('lbList');
      list.style.display = '';
      list.innerHTML = ranked.map((g, i) => {
        const rank = i + 1;
        return `
          <div class="lb-row rank-${rank}">
            <div class="lb-rank">${medal(rank)}</div>
            <div class="lb-name">${escapeHtml(g.name)}</div>
            <div class="lb-figures">
              <div class="lb-ap">${money(g.ap)}</div>
              <div class="lb-sales">${g.count} ${g.count === 1 ? 'sale' : 'sales'}</div>
            </div>
          </div>`;
      }).join('');
    }

    updateLiveIndicator();
  }

  function updateLiveIndicator() {
    const el = $('lbLive');
    if (!el) return;
    const fresh = lastUpdated && (Date.now() - lastUpdated) < 60000;
    el.classList.toggle('stale', !fresh);
  }

  // ---- data ------------------------------------------------------------------
  // Reads the leaderboard_entries VIEW (agent name + AP + date only — no
  // customer PII), which every signed-in agent may read. Returns true only on a
  // genuine success; on failure it leaves the existing `sales` untouched so a
  // blip or expired token can't wipe a good board to zeros.
  async function fetchSales() {
    if (typeof db === 'undefined' || !db.isAuthenticated()) return false;
    const rows = await db.queryShared('leaderboard_entries', 'order=sold_at.desc&limit=2000');
    if (rows === null) return false; // request failed — keep what we have
    sales = Array.isArray(rows) ? rows : [];
    lastUpdated = Date.now();
    return true;
  }

  function renderError() {
    const l = $('lbLoading');
    l.textContent = 'Couldn’t load the leaderboard — retrying…';
    l.style.display = '';
    $('lbEmpty').style.display = 'none';
    $('lbList').style.display = 'none';
    updateLiveIndicator();
  }

  async function loadLeaderboard() {
    if (!loadedOnce) {
      $('lbLoading').textContent = 'Loading the leaderboard…';
      $('lbLoading').style.display = '';
      $('lbEmpty').style.display = 'none';
      $('lbList').style.display = 'none';
    }
    const ok = await fetchSales();
    loadedOnce = true;
    if (ok) render();
    else if (sales.length) updateLiveIndicator(); // keep showing data, let it go stale
    else renderError();
    startPolling();
    return ok;
  }
  window.loadLeaderboard = loadLeaderboard;

  function leaderboardVisible() {
    const p = $('page-leaderboard');
    return p && p.style.display !== 'none';
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      if (!leaderboardVisible()) { updateLiveIndicator(); return; }
      const ok = await fetchSales();
      if (ok) render();
      else updateLiveIndicator(); // failed poll: don't wipe data, just let "Live" go stale
    }, 20000);
  }

  // ---- tabs / custom range ---------------------------------------------------
  function setRange(key) {
    currentRange = key;
    document.querySelectorAll('#lbTabs .lb-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.range === key);
    });
    $('lbCustomRow').style.display = key === 'custom' ? '' : 'none';
    render();
  }

  // ---- log sale --------------------------------------------------------------
  const saleOverlay = () => $('saleModalOverlay');
  const saleErr = () => $('saleModalError');

  function openSaleModal() {
    $('saleForm').reset();
    saleErr().classList.remove('show');
    saleErr().textContent = '';
    saleOverlay().style.display = 'flex';
  }
  function closeSaleModal() {
    saleOverlay().style.display = 'none';
  }

  async function submitSale(e) {
    e.preventDefault();
    const ap = parseFloat($('saleAp').value);
    if (isNaN(ap) || ap < 0) return;

    const payload = {
      agent_name: currentAgentName(),
      ap,
      carrier: $('saleCarrier').value.trim() || null,
      product: $('saleProduct').value.trim() || null,
      client_name: $('saleClient').value.trim() || null,
      source: 'crm',
    };
    const dateVal = $('saleDate').value;
    if (dateVal) payload.sold_at = new Date(dateVal + 'T12:00:00').toISOString();

    const btn = $('saleSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const result = await db.insert('sales', payload); // db.insert adds agent_id = auth.uid()

    btn.disabled = false;
    btn.textContent = 'Save Sale';

    if (!result.success) {
      const raw = String(result.error || '');
      const missing = /relation|does not exist|sales/i.test(raw) && /exist|schema|relation/i.test(raw);
      saleErr().textContent = missing
        ? 'Couldn’t save — the sales table isn’t in the database yet. Run leaderboard-migration.sql in Supabase, then try again.'
        : (raw || 'Could not save the sale. Please try again.');
      saleErr().classList.add('show');
      return;
    }

    closeSaleModal();
    await loadLeaderboard();
    if (typeof showToast === 'function') showToast('Sale added to the leaderboard');
  }

  // ---- init ------------------------------------------------------------------
  function init() {
    const page = $('page-leaderboard');
    if (!page) return; // leaderboard not present

    document.querySelectorAll('#lbTabs .lb-tab').forEach((t) => {
      t.addEventListener('click', () => setRange(t.dataset.range));
    });

    const applyBtn = $('lbCustomApply');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        customFrom = $('lbCustomFrom').value || null;
        customTo = $('lbCustomTo').value || null;
        render();
      });
    }

    const logBtn = $('logSaleBtn');
    if (logBtn) logBtn.addEventListener('click', openSaleModal);
    const closeBtn = $('closeSaleModal');
    if (closeBtn) closeBtn.addEventListener('click', closeSaleModal);
    const overlay = saleOverlay();
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSaleModal(); });
    const form = $('saleForm');
    if (form) form.addEventListener('submit', submitSale);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
