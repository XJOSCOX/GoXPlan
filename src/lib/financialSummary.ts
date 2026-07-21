import { getDebtPriorityLevel, priorityLevelRanges } from "./debtPriority";
import { buildNegotiationInsights, getPlanningTarget, type DebtNegotiationInsight, type PlanningTarget } from "./negotiationTargets";
import type { AccountMovement, Debt, FinancialAccount, Income, Negotiation, Payment } from "../types";

export type PaymentSummary = {
  paidByDebt: Map<string, number>;
  resultingBalanceByDebt: Map<string, { paidAt: string; amount: number }>;
  totalAmountCents: number;
  totalFeesCents: number;
  totalPrincipalCents: number;
};

export type AccountMovementSummary = {
  adjustmentInCents: number;
  adjustmentOutCents: number;
  transferVolumeCents: number;
};

export type PriorityExposureRow = {
  amountCents: number;
  count: number;
  level: string;
};

export type AcceptedAgreementSummary = {
  agreementCents: number;
  debtName: string;
  dueDate: string | null;
  id: string;
  savingsCents: number;
};

export type FinancialSummary = {
  acceptedAgreements: AcceptedAgreementSummary[];
  acceptedAgreementSavingsCents: number;
  accountMovementSummary: AccountMovementSummary;
  availableCashCents: number;
  cashAccounts: FinancialAccount[];
  collectionDebtCount: number;
  currentObligationsCents: number;
  debtCount: number;
  estimatedStartingCashCents: number;
  fullDebtBalanceCents: number;
  fullRemainingBalanceCents: number;
  needsAttentionDebtCount: number;
  negotiationInsights: Map<string, DebtNegotiationInsight>;
  netCashActivityCents: number;
  pastDueDebtCount: number;
  paymentSummary: PaymentSummary;
  possibleSettlementSavingsCents: number;
  priorityExposureRows: PriorityExposureRow[];
  reportedDebtCount: number;
  totalIncomeNetCents: number;
  totalPaymentsCents: number;
  totalPrincipalPaidCents: number;
};

type FinancialSummaryInput = {
  accountMovements?: AccountMovement[];
  accounts?: FinancialAccount[];
  debts?: Debt[];
  income?: Income[];
  negotiations?: Negotiation[];
  payments?: Payment[];
};

export function buildFinancialSummary({
  accountMovements = [],
  accounts = [],
  debts = [],
  income = [],
  negotiations = [],
  payments = [],
}: FinancialSummaryInput): FinancialSummary {
  const paymentSummary = summarizePayments(payments);
  const negotiationInsights = buildNegotiationInsights(negotiations);
  const accountMovementSummary = summarizeAccountMovements(accountMovements);
  const cashAccounts = accounts.filter((account) => account.accountType !== "TRADING");
  const availableCashCents = cashAccounts.reduce((sum, account) => sum + account.availableBalanceCents, 0);
  const totalIncomeNetCents = income.reduce((sum, item) => sum + item.netAmountCents, 0);
  const totalPrincipalPaidCents = paymentSummary.totalPrincipalCents;
  const totalPaymentsCents = paymentSummary.totalAmountCents;
  const fullDebtBalanceCents = debts.reduce((sum, debt) => sum + debt.balanceCents, 0);
  const fullRemainingBalanceCents = debts.reduce((sum, debt) => sum + getDebtRemainingCents(debt, paymentSummary), 0);
  const currentObligationsCents = debts.reduce(
    (sum, debt) => sum + getDebtObligationCents(debt, paymentSummary, negotiationInsights.get(debt.id)),
    0,
  );
  const possibleSettlementSavingsCents = debts.reduce(
    (sum, debt) => sum + getDebtSettlementSavingsCents(debt, negotiationInsights.get(debt.id)),
    0,
  );
  const acceptedAgreements = buildAcceptedAgreements(negotiations, debts);
  const acceptedAgreementSavingsCents = acceptedAgreements.reduce((sum, agreement) => sum + agreement.savingsCents, 0);
  const netCashActivityCents =
    totalIncomeNetCents +
    accountMovementSummary.adjustmentInCents -
    totalPaymentsCents -
    accountMovementSummary.adjustmentOutCents;

  return {
    acceptedAgreements,
    acceptedAgreementSavingsCents,
    accountMovementSummary,
    availableCashCents,
    cashAccounts,
    collectionDebtCount: debts.filter((debt) => debt.status === "COLLECTION").length,
    currentObligationsCents,
    debtCount: debts.length,
    estimatedStartingCashCents: availableCashCents - netCashActivityCents,
    fullDebtBalanceCents,
    fullRemainingBalanceCents,
    needsAttentionDebtCount: debts.filter((debt) => debt.status === "COLLECTION" || debt.status === "PAST_DUE").length,
    negotiationInsights,
    netCashActivityCents,
    pastDueDebtCount: debts.filter((debt) => debt.status === "PAST_DUE").length,
    paymentSummary,
    possibleSettlementSavingsCents,
    priorityExposureRows: buildPriorityExposureRows(debts, paymentSummary, negotiationInsights),
    reportedDebtCount: debts.filter((debt) => debt.reported).length,
    totalIncomeNetCents,
    totalPaymentsCents,
    totalPrincipalPaidCents,
  };
}

export function summarizePayments(payments: Payment[]): PaymentSummary {
  const paidByDebt = new Map<string, number>();
  const resultingBalanceByDebt = new Map<string, { paidAt: string; amount: number }>();
  let totalAmountCents = 0;
  let totalFeesCents = 0;
  let totalPrincipalCents = 0;

  for (const payment of payments) {
    totalAmountCents += payment.amountCents;
    totalFeesCents += payment.interestAndFeesCents ?? 0;
    totalPrincipalCents += payment.principalCents ?? payment.amountCents;

    if (!payment.debtId) continue;
    const paidAmount = payment.principalCents ?? payment.amountCents;
    paidByDebt.set(payment.debtId, (paidByDebt.get(payment.debtId) ?? 0) + paidAmount);

    if (payment.resultingBalanceCents !== null) {
      const current = resultingBalanceByDebt.get(payment.debtId);
      if (!current || payment.paidAt > current.paidAt) {
        resultingBalanceByDebt.set(payment.debtId, { paidAt: payment.paidAt, amount: payment.resultingBalanceCents });
      }
    }
  }

  return { paidByDebt, resultingBalanceByDebt, totalAmountCents, totalFeesCents, totalPrincipalCents };
}

export function summarizeAccountMovements(movements: AccountMovement[]): AccountMovementSummary {
  return movements.reduce(
    (summary, movement) => {
      if (movement.fromAccountId && movement.toAccountId) {
        summary.transferVolumeCents += movement.amountCents;
      } else if (movement.toAccountId) {
        summary.adjustmentInCents += movement.amountCents;
      } else if (movement.fromAccountId) {
        summary.adjustmentOutCents += movement.amountCents;
      }
      return summary;
    },
    { adjustmentInCents: 0, adjustmentOutCents: 0, transferVolumeCents: 0 },
  );
}

export function getDebtRemainingCents(debt: Debt, summary: PaymentSummary) {
  return summary.resultingBalanceByDebt.get(debt.id)?.amount ?? Math.max(0, debt.balanceCents - (summary.paidByDebt.get(debt.id) ?? 0));
}

export function getDebtObligationCents(debt: Debt, summary: PaymentSummary, insight?: DebtNegotiationInsight) {
  return getDebtPlanningTarget(debt, summary, insight).cents;
}

export function getDebtPlanningTarget(debt: Debt, summary: PaymentSummary, insight?: DebtNegotiationInsight): PlanningTarget {
  const remainingCents = getDebtRemainingCents(debt, summary);
  const paidCents = summary.paidByDebt.get(debt.id) ?? 0;
  return getPlanningTarget(debt, paidCents, remainingCents, insight);
}

export function getDebtSettlementSavingsCents(debt: Debt, insight?: DebtNegotiationInsight) {
  if (insight?.acceptedAgreementCents !== null && insight?.acceptedAgreementCents !== undefined) {
    return Math.max(0, debt.balanceCents - insight.acceptedAgreementCents);
  }
  return debt.settlementCents === null ? 0 : Math.max(0, debt.balanceCents - debt.settlementCents);
}

function buildPriorityExposureRows(debts: Debt[], paymentSummary: PaymentSummary, insights: Map<string, DebtNegotiationInsight>) {
  return priorityLevelRanges
    .map((range) => {
      const levelDebts = debts.filter((debt) => getDebtPriorityLevel(debt.priorityScore) === range.level);
      return {
        amountCents: levelDebts.reduce((sum, debt) => sum + getDebtObligationCents(debt, paymentSummary, insights.get(debt.id)), 0),
        count: levelDebts.length,
        level: range.level,
      };
    })
    .filter((row) => row.count > 0);
}

function buildAcceptedAgreements(negotiations: Negotiation[], debts: Debt[]): AcceptedAgreementSummary[] {
  const debtsById = new Map(debts.map((debt) => [debt.id, debt]));
  return negotiations
    .filter((negotiation) => negotiation.status === "ACCEPTED" && negotiation.finalAgreementCents !== null)
    .map((negotiation) => {
      const debt = negotiation.debtId ? debtsById.get(negotiation.debtId) : undefined;
      const originalCents = debt?.balanceCents ?? negotiation.balanceCents ?? 0;
      const agreementCents = negotiation.finalAgreementCents ?? 0;
      return {
        agreementCents,
        debtName: negotiation.debtName ?? debt?.creditorName ?? "Removed debt",
        dueDate: negotiation.dueDate,
        id: negotiation.id,
        savingsCents: Math.max(0, originalCents - agreementCents),
      };
    })
    .sort((left, right) => right.savingsCents - left.savingsCents || left.debtName.localeCompare(right.debtName));
}
