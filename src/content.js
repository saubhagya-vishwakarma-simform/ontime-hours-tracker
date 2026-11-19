// OnTime Hours Tracker — content script
// Reads the timesheet table on ontime.simformsolutions.com and shows a summary panel.
(() => {
  "use strict";

  const DEFAULTS = {
    hoursPerDay: 8,
    workDays: [1, 2, 3, 4, 5],      // 0=Sun ... 6=Sat
    holidays: [],                   // ["2026-11-09", ...]
    excludeMissingPastDays: true,   // past working days with no entry = leave/holiday
    countTodayAsWorking: true
  };
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
    const perDay = settings.hoursPerDay * 60;

    let workingDays = 0, pastWorkingDays = 0, remainingDays = 0, leaveDays = 0, holidayCount = 0;
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
      workingDays++;
      if (isPast) pastWorkingDays++;
      else if (isToday) { if (settings.countTodayAsWorking) remainingDays++; else pastWorkingDays++; }
      else remainingDays++;
    }

    let worked = 0, workedBeforeToday = 0;
    for (const [k, m] of entries) {
      const [y, mo, da] = k.split("-").map(Number);
      const d = new Date(y, mo - 1, da);
      if (d < range.start || d > range.end) continue;
      worked += m;
      if (k < todayKey) workedBeforeToday += m;
    }
    const todayWorked = entries.get(todayKey) || 0;

    const required = workingDays * perDay;
    const pending = Math.max(0, required - worked);
    const progress = required ? Math.min(100, (worked / required) * 100) : 0;
    // Balance up to end of yesterday: + ahead / - behind
    const balance = workedBeforeToday - pastWorkingDays * perDay +
      (settings.countTodayAsWorking ? 0 : todayWorked);
    const perRemainingDay = remainingDays ? pending / remainingDays : 0;
    const todayTarget = Math.max(0, perDay - balance) ; // what today needs to be back on track
    const todayLeft = Math.max(0, todayTarget - todayWorked);

    return {
      workingDays, leaveDays, leaves, holidayCount, remainingDays, required, worked,
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

    const html = `
      <div class="oht-head">
        <span class="oht-title">⏱ Hours Tracker</span>
        <span class="oht-range">${dt(range.start)} → ${dt(range.end)} · ${settings.hoursPerDay}h/day</span>
      </div>
      <div class="oht-grid">
        <div class="oht-card"><div class="oht-label">Working days</div><div class="oht-val">${r.workingDays}</div>
          <div class="oht-sub">${r.remainingDays} remaining</div></div>
        <div class="oht-card"><div class="oht-label">Total hours to complete</div><div class="oht-val">${fmt(r.required)}</div>
          <div class="oht-sub">${r.workingDays} × ${settings.hoursPerDay}h</div></div>
        <div class="oht-card oht-good"><div class="oht-label">Hours completed</div><div class="oht-val">${fmt(r.worked)}</div>
          <div class="oht-sub">${r.progress.toFixed(1)}% done</div></div>
        <div class="oht-card ${r.pending ? "oht-warn" : "oht-good"}"><div class="oht-label">Hours pending</div><div class="oht-val">${fmt(r.pending)}</div>
          <div class="oht-sub">${r.remainingDays ? `≈ ${fmt(r.perRemainingDay)} / remaining day` : "no working days left"}</div></div>
        <div class="oht-card ${r.balance >= 0 ? "oht-good" : "oht-bad"}"><div class="oht-label">Balance till yesterday</div>
          <div class="oht-val">${r.balance >= 0 ? "+" : ""}${fmt(r.balance)}</div>
          <div class="oht-sub">${r.balance >= 0 ? "ahead" : "behind"}</div></div>
        ${r.todayIsWorking ? `<div class="oht-card"><div class="oht-label">Today</div><div class="oht-val">${fmt(r.todayWorked)}</div>
          <div class="oht-sub">${r.todayLeft ? `${fmt(r.todayLeft)} left to stay on track` : "on track ✓"}</div></div>` : ""}
      </div>
      <div class="oht-bar"><div style="width:${r.progress}%"></div></div>
      <div class="oht-foot">Excluded: ${r.holidayCount} holiday(s), ${r.leaveDays} leave/missing day(s) (${leavesTxt}).
        Change hours/day, holidays &amp; weekdays from the extension icon.</div>`;

    let panel = existing;
    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      const card = table.closest(".card") || table.parentElement;
      card.parentElement.insertBefore(panel, card);
    }
    if (panel.dataset.html !== html) { panel.innerHTML = html; panel.dataset.html = html; }
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
    document.addEventListener("input", schedule, true);
    document.addEventListener("change", schedule, true);
    setInterval(render, 60 * 1000); // refresh "today" numbers every minute
  });

  chrome.storage.onChanged.addListener(() =>
    chrome.storage.sync.get(DEFAULTS, (s) => { settings = { ...DEFAULTS, ...s }; render(); })
  );
})();
