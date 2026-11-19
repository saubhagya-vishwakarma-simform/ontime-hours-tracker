const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const $ = (id) => document.getElementById(id);

const toDisplay = (k) => { const [y, m, d] = k.split("-"); return `${d}/${m}/${y}`; };
function toIso(line) {
  const m = line.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

chrome.storage.sync.get(DEFAULTS, (s) => {
  $("hoursPerDay").value = s.hoursPerDay;
  $("days").innerHTML = NAMES.map((n, i) =>
    `<label><input type="checkbox" value="${i}" ${s.workDays.includes(i) ? "checked" : ""}><span>${n}</span></label>`).join("");
  $("holidays").value = s.holidays.map(toDisplay).join("\n");
  $("excludeMissingPastDays").checked = s.excludeMissingPastDays;
  $("countTodayAsWorking").checked = s.countTodayAsWorking;
});

$("save").addEventListener("click", () => {
  const lines = $("holidays").value.split("\n").filter((l) => l.trim());
  const holidays = lines.map(toIso);
  if (holidays.includes(null)) { $("saved").style.color = "#dc3545"; $("saved").textContent = "Use DD/MM/YYYY for holidays"; return; }
  chrome.storage.sync.set({
    hoursPerDay: Math.max(0.25, parseFloat($("hoursPerDay").value) || 8),
    workDays: [...document.querySelectorAll("#days input:checked")].map((c) => +c.value),
    holidays: [...new Set(holidays)].sort(),
    excludeMissingPastDays: $("excludeMissingPastDays").checked,
    countTodayAsWorking: $("countTodayAsWorking").checked
  }, () => {
    $("saved").style.color = "#198754";
    $("saved").textContent = "Saved ✓ — the timesheet updates automatically";
    setTimeout(() => ($("saved").textContent = ""), 2500);
  });
});
