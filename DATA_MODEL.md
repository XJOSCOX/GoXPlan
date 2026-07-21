# Data Model

GoXPlan uses a local SQL.js database saved in IndexedDB. Records are scoped by `user_id`.

## Users

```ts
type User = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
};
```

## Debts

```ts
type Debt = {
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
```

Important debt behavior:

- `balanceCents` is the full debt balance.
- `pastDueCents`, `minimumPaymentCents`, and `settlementCents` can drive current obligations.
- `priorityScore` maps to Emergency, Critical, High, Medium, or Low.
- `trackedAt` is required for progress views.

## Financial Accounts

```ts
type FinancialAccount = {
  id: string;
  userId: string;
  name: string;
  accountType: "BANK" | "TRADING" | "OTHER";
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
```

Trading account behavior:

- A trading account may represent up to 5 accounts.
- Copied accounts share the same profit per account.
- Separate accounts store individual profit values.
- Payout limits and fees are stored as basis points.

## Income

```ts
type Income = {
  id: string;
  userId: string;
  accountId: string | null;
  accountName: string | null;
  accountType: FinancialAccountType | null;
  destinationAccountId: string | null;
  destinationAccountName: string | null;
  destinationAccountType: FinancialAccountType | null;
  source: string;
  sourceType: "EMPLOYMENT" | "TOPSTEP" | "BUSINESS" | "REFUND" | "BENEFITS" | "OTHER";
  amountCents: number;
  grossAmountCents: number;
  feesCents: number;
  taxWithholdingCents: number;
  netAmountCents: number;
  allocatedAmountCents: number;
  remainingAmountCents: number;
  topstepAccountCount: number | null;
  topstepCopiedAccounts: boolean;
  topstepPayoutScope: "ALL_ACCOUNTS" | "SINGLE_ACCOUNT" | null;
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
```

Income rollback behavior:

- `accountId` is the source account, such as a brokerage or trading account.
- `destinationAccountId` is the receiving bank/cash account where net income is deposited.
- Saving an edited income restores the previous source and destination account effects first, then applies the new values.
- Deleting income restores linked bank balances or trading account profits and removes the deposited net amount from the destination account.
- For copied trading accounts, the entered amount is per account and total payout is calculated by account count.

## Payments

```ts
type Payment = {
  id: string;
  userId: string;
  debtId: string | null;
  debtName: string | null;
  accountId: string | null;
  accountName: string | null;
  accountType: FinancialAccountType | null;
  paymentType: "REGULAR" | "MINIMUM" | "CATCH_UP" | "EXTRA" | "SETTLEMENT" | "PAYOFF";
  amountCents: number;
  principalCents: number | null;
  interestAndFeesCents: number | null;
  resultingBalanceCents: number | null;
  confirmationNumber: string;
  paymentMethod: string;
  debtStatusBefore: DebtStatus | null;
  debtStatusAfter: DebtStatus | null;
  paidAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};
```

Payment safety:

- `accountId` is the cash/bank account used to make the payment.
- Payments store the debt status before and after the payment.
- Editing a payment restores the previous debt status and paid-from account movement first.
- Deleting a payment restores the linked account balance and debt snapshot without using native browser confirms.

## Negotiations

```ts
type Negotiation = {
  id: string;
  userId: string;
  debtId: string | null;
  debtName: string | null;
  contactDate: string;
  contactMethod: "PHONE" | "PORTAL" | "EMAIL" | "MAIL" | "CHAT" | "OTHER";
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
```

## Payoff Settings

```ts
type PayoffSettings = {
  userId: string;
  monthlyBudgetCents: number;
  budgetFrequency: "WEEKLY" | "MONTHLY" | "YEARLY";
  emergencyReserveCents: number;
  maxAccountsPerRound: number | null;
  manualAllocations: Record<string, number>;
  strategy:
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
  updatedAt: string;
};
```

## Backup

Backups export user-scoped rows for:

- financial accounts
- debts
- income
- negotiations
- payments
- payoff settings

Import supports preview, merge, replace, validation, and legacy-compatible normalization.
