import type { Payment, PayoffBudgetFrequency, PayoffMilestoneInput } from "../types";

export type PayoffPeriod = {
  frequency: PayoffBudgetFrequency;
  label: string;
  periodEnd: string;
  periodStart: string;
};

export type PayoffPeriodProgress = PayoffPeriod &
  PayoffMilestoneInput & {
    isDone: boolean;
    paidPercent: number;
    remainingCents: number;
  };

export function getCurrentPayoffPeriod(frequency: PayoffBudgetFrequency, referenceDate = new Date()): PayoffPeriod {
  const date = cloneUtcDate(referenceDate);

  if (frequency === "WEEKLY") {
    const day = date.getUTCDay();
    const start = addUtcDays(date, -day);
    const end = addUtcDays(start, 6);
    return {
      frequency,
      label: "This week",
      periodEnd: toDateKey(end),
      periodStart: toDateKey(start),
    };
  }

  if (frequency === "YEARLY") {
    const year = date.getUTCFullYear();
    return {
      frequency,
      label: "This year",
      periodEnd: `${year}-12-31`,
      periodStart: `${year}-01-01`,
    };
  }

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1, 12));
  const end = new Date(Date.UTC(year, month + 1, 0, 12));
  return {
    frequency,
    label: "This month",
    periodEnd: toDateKey(end),
    periodStart: toDateKey(start),
  };
}

export function buildPayoffPeriodProgress(
  frequency: PayoffBudgetFrequency,
  targetCents: number,
  payments: Payment[],
  referenceDate = new Date(),
): PayoffPeriodProgress {
  const period = getCurrentPayoffPeriod(frequency, referenceDate);
  const paidCents = payments
    .filter((payment) => isDateInPeriod(toDateKey(payment.paidAt), period.periodStart, period.periodEnd))
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const normalizedTargetCents = Math.max(0, targetCents);
  const remainingCents = Math.max(0, normalizedTargetCents - paidCents);
  const paidPercent = normalizedTargetCents > 0 ? Math.min(100, Math.round((paidCents / normalizedTargetCents) * 100)) : 0;

  return {
    ...period,
    budgetFrequency: frequency,
    isDone: normalizedTargetCents > 0 && paidCents >= normalizedTargetCents,
    paidCents,
    paidPercent,
    remainingCents,
    targetCents: normalizedTargetCents,
  };
}

export function formatPayoffPeriodRange(periodStart: string, periodEnd: string) {
  const start = formatShortDate(periodStart);
  const end = formatShortDate(periodEnd);
  return start === end ? start : `${start} - ${end}`;
}

function isDateInPeriod(dateKey: string, periodStart: string, periodEnd: string) {
  return dateKey >= periodStart && dateKey <= periodEnd;
}

function cloneUtcDate(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 12));
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateKey(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00.000Z`));
}
