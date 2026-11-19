const DEFAULTS = {
  hoursPerDay: 8,
  workDays: [1, 2, 3, 4, 5],      // 0=Sun ... 6=Sat
  holidays: [],                   // ["2026-11-09", ...]
  excludeMissingPastDays: true,   // past working days with no entry = leave/holiday
  countTodayAsWorking: true
};
