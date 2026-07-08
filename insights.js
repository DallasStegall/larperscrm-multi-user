/**
 * LarpersCRM — Insights (Performance, Analytics, Lead Flow)
 *
 * Three reporting pages built from the agent's OWN Supabase data:
 *   - policies (public.policies) and leads (public.leads), both RLS-scoped to
 *     the signed-in agent, so every agent only ever sees their own numbers.
 * No charting library — plain DOM bars/funnels, matching the rest of the app.
 */

(function () {
  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function money(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  }

  function annualPremium(p) {
    const annual = Number(p.annual_premium) || 0;
    if (annual > 0) return annual;
    return (Number(p.monthly_premium) || 0) * 12;
  }

  // Render a list of horizontal bars into `el`.
  // items: [{ label, value, display? }]; opts: { accent, formatValue, emptyText }
  function renderBars(el, items, opts = {}) {
    if (!el) return;
    if (!items.length) {
      el.innerHTML = `<div class="chart-empty">${escapeHtml(opts.emptyText || 'No data yet.')}</div>`;
      return;
    }
    const max = Math.max(...items.map((i) => i.value), 1);
    const accent = opts.accent ? ` accent-${opts.accent}` : '';
    const fmt = opts.formatValue || ((v) => String(v));
    el.innerHTML = items.map((i) => {
      const pct = Math.max(2, Math.round((i.value / max) * 100));
      return `
        <div class="bar-row">
          <div class="bar-label">${escapeHtml(i.label)}</div>
          <div class="bar-track"><div class="bar-fill${accent}" style="width:${pct}%"></div></div>
          <div class="bar-value">${escapeHtml(i.display != null ? i.display : fmt(i.value))}</div>
        </div>`;
    }).join('');
  }

  // Count occurrences of a field across rows, returning [{label, value}] desc.
  function countBy(rows, getKey, { unknown = 'Unknown', limit = 0 } = {}) {
    const map = new Map();
    for (const r of rows) {
      const raw = getKey(r);
      const key = (raw == null || String(raw).trim() === '') ? unknown : String(raw).trim();
      map.set(key, (map.get(key) || 0) + 1);
    }
    let arr = Array.from(map.entries()).map(([label, value]) => ({ label, value }));
    arr.sort((a, b) => b.value - a.value);
    if (limit) arr = arr.slice(0, limit);
    return arr;
  }

  function monthBuckets(count) {
    // Returns the last `count` months as [{ key:'YYYY-MM', label:'Jul', y, m }], oldest first.
    const now = new Date();
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ key, label: d.toLocaleDateString('en-US', { month: 'short' }), y: d.getFullYear(), m: d.getMonth() });
    }
    return out;
  }

  function monthKeyOf(dateStr) {
    if (!dateStr) return null;
    const d = new Date(String(dateStr).length <= 10 ? dateStr + 'T00:00:00' : dateStr);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function setState(prefix, state) {
    // state: 'loading' | 'empty' | 'content'
    const L = $(prefix + 'Loading'), E = $(prefix + 'Empty'), C = $(prefix + 'Content');
    if (L) L.style.display = state === 'loading' ? '' : 'none';
    if (E) E.style.display = state === 'empty' ? '' : 'none';
    if (C) C.style.display = state === 'content' ? '' : 'none';
  }

  async function fetchTable(table) {
    if (typeof db === 'undefined' || !db.isAuthenticated()) return [];
    const rows = await db.query(table);
    return Array.isArray(rows) ? rows : [];
  }

  // ---- PERFORMANCE -----------------------------------------------------------
  const STAGE_SOLD = 'sold';

  async function loadPerformance() {
    setState('perf', 'loading');
    const [policies, leads] = await Promise.all([fetchTable('policies'), fetchTable('leads')]);

    if (!policies.length && !leads.length) { setState('perf', 'empty'); return; }

    const totalPremium = policies.reduce((s, p) => s + annualPremium(p), 0);
    const active = policies.filter((p) => (p.status || '') === 'active').length;
    const soldLeads = leads.filter((l) => (l.stage || '') === STAGE_SOLD).length;
    const conversion = leads.length ? Math.round((soldLeads / leads.length) * 100) : 0;

    $('perfPolicies').textContent = String(policies.length);
    $('perfPremium').textContent = money(totalPremium);
    $('perfActive').textContent = String(active);
    $('perfLeads').textContent = String(leads.length);
    $('perfConversion').textContent = conversion + '%';

    const months = monthBuckets(6);
    const countByMonth = new Map(months.map((b) => [b.key, 0]));
    const premByMonth = new Map(months.map((b) => [b.key, 0]));
    for (const p of policies) {
      const key = monthKeyOf(p.sale_date || p.created_at);
      if (key && countByMonth.has(key)) {
        countByMonth.set(key, countByMonth.get(key) + 1);
        premByMonth.set(key, premByMonth.get(key) + annualPremium(p));
      }
    }
    renderBars($('perfMonthlyChart'), months.map((b) => ({ label: b.label, value: countByMonth.get(b.key) })),
      { emptyText: 'No policies in the last 6 months.' });
    renderBars($('perfPremiumChart'), months.map((b) => ({ label: b.label, value: premByMonth.get(b.key), display: money(premByMonth.get(b.key)) })),
      { accent: 'success', emptyText: 'No premium in the last 6 months.' });

    setState('perf', 'content');
  }

  // ---- ANALYTICS -------------------------------------------------------------
  async function loadAnalytics() {
    setState('an', 'loading');
    const [policies, leads] = await Promise.all([fetchTable('policies'), fetchTable('leads')]);

    if (!policies.length && !leads.length) { setState('an', 'empty'); return; }

    renderBars($('anStatusChart'), countBy(policies, (p) => p.status, { unknown: 'pending' }),
      { emptyText: 'No policies yet.' });

    // Top carriers by summed annual premium
    const carrierMap = new Map();
    for (const p of policies) {
      const c = (p.carrier && String(p.carrier).trim()) || 'Unknown';
      carrierMap.set(c, (carrierMap.get(c) || 0) + annualPremium(p));
    }
    const carriers = Array.from(carrierMap.entries())
      .map(([label, value]) => ({ label, value, display: money(value) }))
      .sort((a, b) => b.value - a.value).slice(0, 6);
    renderBars($('anCarrierChart'), carriers, { accent: 'success', emptyText: 'No policies yet.' });

    renderBars($('anSourceChart'), countBy(leads, (l) => l.source, { limit: 6 }),
      { accent: 'warning', emptyText: 'No leads yet.' });

    renderBars($('anStageChart'), countBy(leads, (l) => l.stage, { unknown: 'new' }),
      { emptyText: 'No leads yet.' });

    setState('an', 'content');
  }

  // ---- LEAD FLOW -------------------------------------------------------------
  const PIPELINE = [
    { key: 'new', label: 'New' },
    { key: 'contacted', label: 'Contacted' },
    { key: 'appointment_set', label: 'Appointment Set' },
    { key: 'sold', label: 'Sold' },
  ];
  const DEAD = [
    { key: 'not_interested', label: 'Not Interested' },
    { key: 'dnc', label: 'Do Not Call' },
  ];

  async function loadLeadFlow() {
    setState('lf', 'loading');
    const leads = await fetchTable('leads');

    if (!leads.length) { setState('lf', 'empty'); return; }

    const counts = {};
    for (const l of leads) {
      const s = l.stage || 'new';
      counts[s] = (counts[s] || 0) + 1;
    }

    const total = leads.length;
    const sold = counts.sold || 0;
    const pipeline = (counts.new || 0) + (counts.contacted || 0) + (counts.appointment_set || 0);
    const conversion = total ? Math.round((sold / total) * 100) : 0;

    $('lfTotal').textContent = String(total);
    $('lfPipeline').textContent = String(pipeline);
    $('lfSold').textContent = String(sold);
    $('lfConversion').textContent = conversion + '%';

    const maxStage = Math.max(...PIPELINE.map((s) => counts[s.key] || 0), 1);
    $('lfFunnel').innerHTML = PIPELINE.map((s, i) => {
      const n = counts[s.key] || 0;
      const pct = Math.max(6, Math.round((n / maxStage) * 100));
      const share = total ? Math.round((n / total) * 100) : 0;
      return `
        <div class="funnel-row">
          <div class="funnel-stage">${escapeHtml(s.label)}<small>${share}% of leads</small></div>
          <div class="funnel-bar-wrap"><div class="funnel-bar funnel-s${i + 1}" style="width:${pct}%">${n}</div></div>
        </div>`;
    }).join('');

    const deadItems = DEAD.map((s) => ({ label: s.label, value: counts[s.key] || 0 }));
    const anyDead = deadItems.some((d) => d.value > 0);
    renderBars($('lfDead'), anyDead ? deadItems : [], { accent: 'warning', emptyText: 'No dead leads — nice.' });

    setState('lf', 'content');
  }

  // ---- init ------------------------------------------------------------------
  function hook(page, loader) {
    const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (nav) nav.addEventListener('click', loader);
  }

  function init() {
    if (!$('perfContent') && !$('anContent') && !$('lfContent')) return;
    hook('performance', loadPerformance);
    hook('analytics', loadAnalytics);
    hook('leadflow', loadLeadFlow);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
