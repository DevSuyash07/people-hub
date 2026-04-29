// Shared attendance rules for Digi Captain CRM
//
// Status logic (per user request):
//   * scheduled = employee's scheduled check-in time (e.g. "09:30")
//   * grace     = ±15 minutes
//   * If no check-in at all by end of day  -> "leave"
//   * If check-in <= scheduled + grace     -> "present" (on-time / early)
//   * If check-in >  scheduled + grace     -> "late"
//   * If worked hours < 5h                 -> overrides to "half_day"
//
// Workday target: 9 hours.

export const GRACE_MIN = 15;
export const FULL_DAY_HOURS = 9;
export const HALF_DAY_BELOW = 5;

function toMinutes(hhmm: string): number {
  // Accepts "HH:MM" or "HH:MM:SS"
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function workedHours(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const diff = toMinutes(checkOut) - toMinutes(checkIn);
  return Math.max(0, diff / 60);
}

export type AttendanceStatus = "present" | "late" | "leave" | "half_day" | "absent";

export function computeAttendanceStatus(opts: {
  scheduled: string;        // "HH:MM"
  checkIn: string | null;   // "HH:MM"
  checkOut?: string | null; // "HH:MM"
}): AttendanceStatus {
  const { scheduled, checkIn, checkOut } = opts;
  if (!checkIn) return "leave";

  const sched = toMinutes(scheduled);
  const inMin = toMinutes(checkIn);
  const lateThreshold = sched + GRACE_MIN;

  let base: AttendanceStatus = inMin <= lateThreshold ? "present" : "late";

  if (checkOut) {
    const hrs = workedHours(checkIn, checkOut);
    if (hrs < HALF_DAY_BELOW) base = "half_day";
  }
  return base;
}
