// OnTime Hours Tracker — content script
// Reads the timesheet table on ontime.simformsolutions.com and shows a summary panel.
(() => {
  "use strict";

  let settings = { ...DEFAULTS };
  const PANEL_ID = "oht-panel";

  // ---------- helpers ----------
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  function fmt(mins) {
    const neg = mins < 0;
    mins = Math.round(Math.abs(mins));
    return `${neg ? "-" : ""}${Math.floor(mins / 60)}h ${pad(mins % 60)}m`;
  }

  // "08:11" or "121:15:00" -> minutes
  function parseDuration(txt) {
    const m = (txt || "").trim().match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
    if (!m) return null;
    return (+m[1]) * 60 + (+m[2]) + (m[3] ? (+m[3]) / 60 : 0);
  }

  // Table date "26/10/2026" (DD/MM/YYYY)
  function parseRowDate(txt) {
    const m = (txt || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
  }

  // Filter input "10/26/2026" (MM/DD/YYYY)
  function parseFilterDate(txt) {
    const m = (txt || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? new Date(+m[3], +m[1] - 1, +m[2]) : null;
  }

  function findTable() {
    return [...document.querySelectorAll("table")].find((t) =>
      [...t.querySelectorAll("th")].some((th) => /total\s*time/i.test(th.textContent))
    );
  }

  function readEntries(table) {
    const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim().toLowerCase());
    const dateIdx = headers.findIndex((h) => h === "date");
    const timeIdx = headers.findIndex((h) => /total\s*time/.test(h));
    const entries = new Map(); // iso -> minutes
    table.querySelectorAll("tbody tr").forEach((tr) => {
      const cells = tr.children;
      if (cells.length <= Math.max(dateIdx, timeIdx)) return;
      const d = parseRowDate(cells[dateIdx]?.textContent);
      const mins = parseDuration(cells[timeIdx]?.textContent);
      if (!d || mins == null) return;
      const k = iso(d);
      entries.set(k, (entries.get(k) || 0) + mins);
    });
    return entries;
  }

  function readRange(entries) {
    const s = parseFilterDate(document.querySelector('input[name="selectedStartDate"]')?.value);
    const e = parseFilterDate(document.querySelector('input[name="selectedEndDate"]')?.value);
    if (s && e) return { start: s, end: e };
    // Fallback: span of the dates shown in the table
    const keys = [...entries.keys()].sort();
    if (!keys.length) return null;
    const [ys, ms, ds] = keys[0].split("-").map(Number);
    const [ye, me, de] = keys[keys.length - 1].split("-").map(Number);
    return { start: new Date(ys, ms - 1, ds), end: new Date(ye, me - 1, de) };
  }

  // ---------- calculation ----------
  function calculate(entries, range) {
    const today = dayStart(new Date());
    const todayKey = iso(today);
    const holidays = new Set(settings.holidays);
    const halves = new Set(settings.halfDays);
    const perDay = settings.hoursPerDay * 60;

    let daysTillNow = 0, workingDays = 0, pastWorkingDays = 0, remainingDays = 0, leaveDays = 0, holidayCount = 0;
    const leaves = [];

    for (let d = dayStart(range.start); d <= range.end; d.setDate(d.getDate() + 1)) {
      const k = iso(d);
      const hasEntry = entries.has(k);
      const isWorkDay = settings.workDays.includes(d.getDay());
      if (!isWorkDay) continue;
      if (holidays.has(k)) { holidayCount++; continue; }
      const isPast = d < today;
      const isToday = k === todayKey;
      if (isPast && !hasEntry && settings.excludeMissingPastDays) {
        leaveDays++; leaves.push(k); continue;
      }
      const w = halves.has(k) ? 0.5 : 1;
      workingDays += w;
      if (d <= today) daysTillNow += w;
      if (isPast) pastWorkingDays += w;
      else if (isToday) { if (settings.countTodayAsWorking) remainingDays += w; else pastWorkingDays += w; }
      else remainingDays += w;
    }

    let worked = 0, workedBeforeToday = 0, workedTillToday = 0;
    for (const [k, m] of entries) {
      const [y, mo, da] = k.split("-").map(Number);
      const d = new Date(y, mo - 1, da);
      if (d < range.start || d > range.end) continue;
      worked += m;
      if (k < todayKey) workedBeforeToday += m;
      if (k <= todayKey) workedTillToday += m;
    }
    const todayWorked = entries.get(todayKey) || 0;

    const required = workingDays * perDay;
    const pending = Math.max(0, required - worked);
    const dueNow = daysTillNow * perDay;
    const pendingNow = Math.max(0, dueNow - workedTillToday);
    const progress = dueNow ? Math.min(100, (workedTillToday / dueNow) * 100) : 0; // vs hours due till today
    // Balance up to end of yesterday: + ahead / - behind
    const balance = workedBeforeToday - pastWorkingDays * perDay +
      (settings.countTodayAsWorking ? 0 : todayWorked);
    const perRemainingDay = remainingDays ? pending / remainingDays : 0;
    const todayTarget = Math.max(0, perDay - balance) ; // what today needs to be back on track
    const todayLeft = Math.max(0, todayTarget - todayWorked);

    return {
      daysTillNow, dueNow, pendingNow, workingDays, leaveDays, leaves, holidayCount, remainingDays, required, worked,
      pending, progress, balance, perRemainingDay, todayWorked, todayLeft,
      todayIsWorking: settings.workDays.includes(today.getDay()) && !holidays.has(todayKey) &&
        today >= dayStart(range.start) && today <= range.end
    };
  }

  // ---------- rendering ----------
  function render() {
    const table = findTable();
    const existing = document.getElementById(PANEL_ID);
    if (!table) { existing?.remove(); return; }
    const entries = readEntries(table);
    const range = readRange(entries);
    if (!range) return;
    const r = calculate(entries, range);

    const dt = (d) => d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
    const leavesTxt = r.leaves.length
      ? r.leaves.map((k) => { const [y, m, d] = k.split("-"); return `${d}/${m}`; }).join(", ")
      : "none";

    const card = (cls, icon, label, val, sub) =>
      `<div class="oht-card ${cls}"><div class="oht-ico">${icon}</div><div>
        <div class="oht-label">${label}</div><div class="oht-val">${val}</div><div class="oht-sub">${sub}</div></div></div>`;
    const html = `
      <div class="oht-head">
        <div><div class="oht-title">⏱ Hours Tracker</div>
          <div class="oht-range">${dt(range.start)} → ${dt(range.end)} · ${settings.hoursPerDay}h/day</div></div>
        <div class="oht-ring" style="--p:${r.progress}"><span>${r.progress.toFixed(0)}%</span></div>
      </div>
      <div class="oht-grid">
        ${card("", "📆", "Total days", r.daysTillNow, "working days till now")}
        ${card("", "🎯", "Hours to complete", fmt(r.dueNow), `${r.daysTillNow} days × ${settings.hoursPerDay}h`)}
        ${card(r.pendingNow ? "oht-warn" : "oht-good", "⏳", "Pending hours", fmt(r.pendingNow), "till today · " + fmt(r.worked) + " done")}
        ${card("oht-today", "☀️", "Today", fmt(r.todayWorked),
          r.todayIsWorking ? (r.todayLeft ? `${fmt(r.todayLeft)} left to stay on track` : "on track ✓") : "not a working day")}
        ${card("oht-total", "🗓️", "Total working days", r.workingDays, `${r.remainingDays} remaining`)}
        ${card("oht-total", "🏁", "Total hours to complete", fmt(r.required), `${r.workingDays} days × ${settings.hoursPerDay}h`)}
      </div>
      <div class="oht-foot">Excluded: ${r.holidayCount} holiday(s), ${r.leaveDays} leave/missing day(s) (${leavesTxt}) ·
        edit settings from the extension icon</div>`;

    let panel = existing;
    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      const card = table.closest(".card") || table.parentElement;
      card.parentElement.insertBefore(panel, card);
    }
    panel.innerHTML = html;
  }

  // ---------- wiring ----------
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(render, 300); };

  chrome.storage.sync.get(DEFAULTS, (s) => {
    settings = { ...DEFAULTS, ...s };
    render();
    new MutationObserver((muts) => {
      if (muts.every((m) => m.target.closest && m.target.closest("#" + PANEL_ID))) return;
      schedule();
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(render, 60 * 1000); // refresh "today" numbers every minute
  });

  chrome.storage.onChanged.addListener((ch) => {
    for (const k in ch) settings[k] = ch[k].newValue;
    render();
  });
})();
