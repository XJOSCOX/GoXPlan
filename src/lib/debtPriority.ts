import type { DebtPriorityLevel } from "../types";

export const priorityLevelRanges: Array<{
  level: DebtPriorityLevel;
  range: string;
  min: number;
}> = [
  { level: "Emergency", range: "100+", min: 100 },
  { level: "Critical", range: "75-99", min: 75 },
  { level: "High", range: "50-74", min: 50 },
  { level: "Medium", range: "25-49", min: 25 },
  { level: "Low", range: "Below 25", min: 0 },
];

export function getDebtPriorityLevel(score: number): DebtPriorityLevel {
  if (score >= 100) return "Emergency";
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Medium";
  return "Low";
}
