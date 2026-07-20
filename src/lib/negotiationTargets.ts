import type { Debt, Negotiation } from "../types";

export type DebtNegotiationInsight = {
  acceptedAgreementCents: number | null;
  agreementDueAt: string | null;
  offerExpiresAt: string | null;
  payForDeleteIncluded: boolean;
  sourceNegotiationId: string | null;
};

export type PlanningTarget = {
  cents: number;
  label: string;
  source: "debt" | "negotiation";
};

export function buildNegotiationInsights(negotiations: Negotiation[]) {
  const byDebt = new Map<string, DebtNegotiationInsight>();

  for (const negotiation of negotiations) {
    if (!negotiation.debtId) continue;
    const current = byDebt.get(negotiation.debtId) ?? emptyInsight();
    const next = { ...current };

    if (negotiation.payForDeleteIncluded) next.payForDeleteIncluded = true;

    if (negotiation.offerExpiresAt && isBetterDate(negotiation.offerExpiresAt, next.offerExpiresAt)) {
      next.offerExpiresAt = negotiation.offerExpiresAt;
    }

    if (negotiation.status === "ACCEPTED" && negotiation.finalAgreementCents !== null) {
      const shouldUseAgreement =
        next.acceptedAgreementCents === null ||
        isBetterDate(negotiation.dueDate ?? negotiation.offerExpiresAt, next.agreementDueAt ?? next.offerExpiresAt) ||
        negotiation.finalAgreementCents < next.acceptedAgreementCents;

      if (shouldUseAgreement) {
        next.acceptedAgreementCents = negotiation.finalAgreementCents;
        next.agreementDueAt = negotiation.dueDate;
        next.offerExpiresAt = negotiation.offerExpiresAt ?? next.offerExpiresAt;
        next.sourceNegotiationId = negotiation.id;
      }
    }

    byDebt.set(negotiation.debtId, next);
  }

  return byDebt;
}

export function getPlanningTarget(debt: Debt, paidCents: number, remainingCents: number, insight?: DebtNegotiationInsight): PlanningTarget {
  if (insight?.acceptedAgreementCents !== null && insight?.acceptedAgreementCents !== undefined) {
    return {
      cents: Math.max(0, Math.min(remainingCents, insight.acceptedAgreementCents - paidCents)),
      label: "Agreement",
      source: "negotiation",
    };
  }

  if (debt.status === "CLOSED" || debt.status === "COLLECTION") {
    if (debt.settlementCents !== null) {
      return { cents: Math.max(0, Math.min(remainingCents, debt.settlementCents - paidCents)), label: "Settlement", source: "debt" };
    }
    return { cents: remainingCents, label: "Payoff", source: "debt" };
  }

  if (debt.status === "SETTLED") return { cents: 0, label: "Settled", source: "debt" };
  if (debt.pastDueCents !== null) return { cents: Math.max(0, Math.min(remainingCents, debt.pastDueCents - paidCents)), label: "Past due", source: "debt" };
  if (debt.minimumPaymentCents !== null) return { cents: Math.max(0, Math.min(remainingCents, debt.minimumPaymentCents)), label: "Minimum", source: "debt" };
  return { cents: remainingCents, label: "Payoff", source: "debt" };
}

export function getNegotiationDeadlineTime(insight?: DebtNegotiationInsight) {
  const value = insight?.agreementDueAt ?? insight?.offerExpiresAt;
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function emptyInsight(): DebtNegotiationInsight {
  return {
    acceptedAgreementCents: null,
    agreementDueAt: null,
    offerExpiresAt: null,
    payForDeleteIncluded: false,
    sourceNegotiationId: null,
  };
}

function isBetterDate(candidate: string | null, current: string | null) {
  if (!candidate) return false;
  if (!current) return true;
  return new Date(candidate).getTime() < new Date(current).getTime();
}
