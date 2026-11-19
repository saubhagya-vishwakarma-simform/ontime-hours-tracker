const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");

const full = new Set(), half = new Set();

// Cycle runs 26th -> 25th (inclusive); days from older cycles are dropped.
const t0 = new Date();
const start = new Date(t0.getFullYear(), t0.getMonth() - (t0.getDate() <= 25 ? 1 : 0), 26);
const end = new Date(start.getFullYear(), start.getMonth() + 1, 25);
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const [K0, K1] = [key(start), key(end)];
const inCycle = (k) => k >= K0 && k <= K1;

function drawCal() {
  const f = (d) => d.toLocaleString(undefined, { day: "numeric", month: "short" });
  $("title").textContent = `${f(start)} – ${f(end)} ${end.getFullYear()}`;
  const tk = key(new Date());
  let h = NAMES.map((n) => `<i>${n[0]}</i>`).join("") + "<span></span>".repeat(start.getDay());
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = key(d);
    const lbl = d.getDate() === 26 || d.getDate() === 1 ? `<small>${d.toLocaleString(undefined, { month: "short" })}</small>` : "";
    h += `<u data-k="${k}" class="${full.has(k) ? "full" : half.has(k) ? "half" : ""} ${k === tk ? "today" : ""}">${d.getDate()}${lbl}</u>`;
  }
  $("cal").innerHTML = h;
}

$("cal").addEventListener("click", (e) => {
  const k = e.target.closest("u")?.dataset.k; if (!k) return;
  const mode = document.querySelector("[name=mode]:checked").value;
  const had = (mode === "full" ? full : half).has(k);
  full.delete(k); half.delete(k);
  if (mode !== "clear" && !had) (mode === "full" ? full : half).add(k);
  drawCal();
});
document.querySelectorAll("[name=mode]").forEach((r) => r.addEventListener("change", () => ($("calbox").hidden = false)));

chrome.storage.sync.get(DEFAULTS, (s) => {
  $("days").innerHTML = NAMES.map((n, i) =>
    `<label><input type="checkbox" value="${i}" ${s.workDays.includes(i) ? "checked" : ""}><span>${n}</span></label>`).join("");
  s.holidays.filter(inCycle).forEach((k) => full.add(k));
  s.halfDays.filter(inCycle).forEach((k) => half.add(k));
  $("excludeMissingPastDays").checked = s.excludeMissingPastDays;
  $("countTodayAsWorking").checked = s.countTodayAsWorking;
  drawCal();
});

$("save").addEventListener("click", () => {
  chrome.storage.sync.set({
    hoursPerDay: 8,
    workDays: [...document.querySelectorAll("#days input:checked")].map((c) => +c.value),
    holidays: [...full].sort(),
    halfDays: [...half].sort(),
    excludeMissingPastDays: $("excludeMissingPastDays").checked,
    countTodayAsWorking: $("countTodayAsWorking").checked
  }, () => {
    $("saved").textContent = "Saved ✓";
    setTimeout(() => ($("saved").textContent = ""), 2000);
  });
});
