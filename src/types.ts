export type PublicUser = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type SignupInput = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
};

export type LoginInput = {
  login: string;
  password: string;
};

export type DashboardStats = {
  debts: number;
  income: number;
  negotiations: number;
  payments: number;
};

export type DebtStatus = "OPEN" | "PAST_DUE" | "COLLECTION" | "CLOSED" | "NOT_REPORTED" | "SETTLED";

export type DebtPriorityLevel = "Emergency" | "Critical" | "High" | "Medium" | "Low";

export type DebtCategory =
  | "AUTO_LOAN"
  | "CREDIT_CARD"
  | "COLLECTION"
  | "PERSONAL_LOAN"
  | "BNPL"
  | "RETAIL_FINANCING"
  | "MEDICAL"
  | "UTILITY"
  | "OTHER";

export type Debt = {
  id: string;
  userId: string;
  priority: number;
  priorityScore: number;
  trackedAt: string;
  creditorName: string;
  category: DebtCategory;
  balanceCents: number;
  settlementCents: number | null;
  pastDueCents: number | null;
  aprBasisPoints: number | null;
  minimumPaymentCents: number | null;
  monthsBehind: number | null;
  targetDate: string | null;
  settlementExpiresAt: string | null;
  status: DebtStatus;
  reported: boolean;
  payForDelete: boolean;
  negotiable: boolean;
  reason: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type DebtInput = {
  id?: string;
  priority: number;
  priorityScore: number;
  trackedDate: string;
  creditorName: string;
  category: DebtCategory;
  balance: string;
  settlement: string;
  pastDue: string;
  apr: string;
  minimumPayment: string;
  monthsBehind: string;
  targetDate: string;
  settlementExpiresDate: string;
  status: DebtStatus;
  reported: boolean;
  payForDelete: boolean;
  negotiable: boolean;
  reason: string;
  notes: string;
};

export type Income = {
  id: string;
  userId: string;
  accountId: string | null;
  accountName: string | null;
  accountType: FinancialAccountType | null;
  source: string;
  sourceType: IncomeSourceType;
  amountCents: number;
  grossAmountCents: number;
  feesCents: number;
  taxWithholdingCents: number;
  netAmountCents: number;
  allocatedAmountCents: number;
  remainingAmountCents: number;
  topstepAccountCount: number | null;
  topstepCopiedAccounts: boolean;
  topstepPayoutScope: TopstepPayoutScope | null;
  topstepSelectedAccount: number | null;
  topstepProfitPerAccountCents: number | null;
  topstepTotalProfitCents: number | null;
  topstepWithdrawableCents: number | null;
  topstepFeeCents: number | null;
  receivedAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type IncomeSourceType = "EMPLOYMENT" | "TOPSTEP" | "BUSINESS" | "REFUND" | "BENEFITS" | "OTHER";
export type TopstepPayoutScope = "ALL_ACCOUNTS" | "SINGLE_ACCOUNT";
export type FinancialAccountType = "BANK" | "TRADING" | "OTHER";

export type FinancialAccount = {
  id: string;
  userId: string;
  name: string;
  accountType: FinancialAccountType;
  institution: string;
  availableBalanceCents: number;
  maxSubAccounts: number | null;
  copiedAccounts: boolean;
  tradingAccountProfitsCents: number[];
  payoutLimitBasisPoints: number | null;
  feeBasisPoints: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type FinancialAccountInput = {
  id?: string;
  name: string;
  accountType: FinancialAccountType;
  institution: string;
  availableBalance: string;
  maxSubAccounts: string;
  copiedAccounts: boolean;
  tradingAccountProfits: string[];
  payoutLimitPercent: string;
  feePercent: string;
  notes: string;
};

export type IncomeInput = {
  id?: string;
  accountId: string;
  source: string;
  sourceType: IncomeSourceType;
  grossAmount: string;
  fees: string;
  taxWithholding: string;
  allocatedAmount: string;
  topstepAccountCount: string;
  topstepCopiedAccounts: boolean;
  topstepPayoutScope: TopstepPayoutScope;
  topstepSelectedAccount: string;
  topstepProfitPerAccount: string;
  receivedDate: string;
  notes: string;
};

export type Payment = {
  id: string;
  userId: string;
  debtId: string | null;
  debtName: string | null;
  paymentType: PaymentType;
  amountCents: number;
  principalCents: number | null;
  interestAndFeesCents: number | null;
  resultingBalanceCents: number | null;
  confirmationNumber: string;
  paymentMethod: string;
  paidAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type PaymentType = "REGULAR" | "MINIMUM" | "CATCH_UP" | "EXTRA" | "SETTLEMENT" | "PAYOFF";

export type PaymentInput = {
  id?: string;
  debtId: string;
  paymentType: PaymentType;
  amount: string;
  principal: string;
  interestAndFees: string;
  resultingBalance: string;
  confirmationNumber: string;
  paymentMethod: string;
  paidDate: string;
  updateDebtStatus: boolean;
  notes: string;
};

export type NegotiationContactMethod = "PHONE" | "PORTAL" | "EMAIL" | "MAIL" | "CHAT" | "OTHER";

export type NegotiationStatus =
  | "PLANNED"
  | "CONTACTED"
  | "OFFER_SENT"
  | "COUNTERED"
  | "ACCEPTED"
  | "DECLINED"
  | "FOLLOW_UP"
  | "CLOSED";

export type Negotiation = {
  id: string;
  userId: string;
  debtId: string | null;
  debtName: string | null;
  contactDate: string;
  contactMethod: NegotiationContactMethod;
  representative: string;
  phoneOrPortal: string;
  balanceCents: number | null;
  currentOfferCents: number | null;
  userOfferCents: number | null;
  counterOfferCents: number | null;
  finalAgreementCents: number | null;
  numberOfPayments: number | null;
  dueDate: string | null;
  writtenAgreementReceived: boolean;
  payForDeleteIncluded: boolean;
  offerExpiresAt: string | null;
  followUpAt: string | null;
  status: NegotiationStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type NegotiationInput = {
  id?: string;
  debtId: string;
  contactDate: string;
  contactMethod: NegotiationContactMethod;
  representative: string;
  phoneOrPortal: string;
  balance: string;
  currentOffer: string;
  userOffer: string;
  counterOffer: string;
  finalAgreement: string;
  numberOfPayments: string;
  dueDate: string;
  writtenAgreementReceived: boolean;
  payForDeleteIncluded: boolean;
  offerExpiresDate: string;
  followUpDate: string;
  status: NegotiationStatus;
  notes: string;
};

export type PayoffStrategy =
  | "HYBRID"
  | "EMERGENCY_FIRST"
  | "CREDIT_REPAIR_FIRST"
  | "SNOWBALL"
  | "AVALANCHE"
  | "SETTLEMENT_FIRST"
  | "MANUAL"
  | "PRIORITY"
  | "LOW_BALANCE"
  | "HIGH_BALANCE"
  | "SETTLEMENT";

export type PayoffBudgetFrequency = "WEEKLY" | "MONTHLY" | "YEARLY";

export type PayoffSettings = {
  userId: string;
  monthlyBudgetCents: number;
  budgetFrequency: PayoffBudgetFrequency;
  emergencyReserveCents: number;
  maxAccountsPerRound: number | null;
  manualAllocations: Record<string, number>;
  strategy: PayoffStrategy;
  updatedAt: string;
};

export type PayoffSettingsInput = {
  monthlyBudget: string;
  budgetFrequency: PayoffBudgetFrequency;
  emergencyReserve: string;
  maxAccountsPerRound: string;
  manualAllocations: Record<string, string>;
  strategy: PayoffStrategy;
};
