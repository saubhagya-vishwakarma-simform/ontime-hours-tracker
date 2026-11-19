const DEFAULTS = {
  hoursPerDay: 8,
  workDays: [1, 2, 3, 4, 5],      // 0=Sun ... 6=Sat
  holidays: [],                   // full days off ["2026-11-09", ...]
  halfDays: [],                   // half days off (counts as half of hoursPerDay)
  excludeMissingPastDays: true,   // past working days with no entry = leave/holiday
  countTodayAsWorking: true
};
