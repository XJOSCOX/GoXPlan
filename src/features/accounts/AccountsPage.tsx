import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  ChartNoAxesColumnIncreasing,
  Edit3,
  Landmark,
  Plus,
  ReceiptText,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type {
  AccountAdjustmentDirection,
  AccountMovement,
  AccountMovementInput,
  AccountMovementType,
  FinancialAccount,
  FinancialAccountInput,
  FinancialAccountType,
  Income,
  Payment,
} from "../../types";

type AccountsPageProps = {
  accounts: FinancialAccount[];
  accountMovements: AccountMovement[];
  income: Income[];
  payments: Payment[];
  onSave: (input: FinancialAccountInput) => Promise<void>;
  onDelete: (accountId: string) => Promise<void>;
  onSaveMovement: (input: AccountMovementInput) => Promise<void>;
  onDeleteMovement: (movementId: string) => Promise<void>;
};

type AccountActivity = {
  id: string;
  amountCents: number;
  balanceAfterCents: number;
  date: string;
  label: string;
  meta: string;
  tone: "in" | "out";
  type: "income" | "movement" | "payment";
};

const emptyAccountForm: FinancialAccountInput = {
  name: "",
  accountType: "TRADING",
  institution: "",
  availableBalance: "",
  maxSubAccounts: "5",
  copiedAccounts: true,
  tradingAccountProfits: ["", "", "", "", ""],
  payoutLimitPercent: "50",
  feePercent: "10",
  notes: "",
};

const accountTypeLabels: Record<FinancialAccountType, string> = {
  BANK: "Bank",
  TRADING: "Trading",
  OTHER: "Other",
};

const emptyMovementForm: AccountMovementInput = {
  movementType: "TRANSFER",
  fromAccountId: "",
  toAccountId: "",
  adjustmentAccountId: "",
  adjustmentDirection: "INCREASE",
  amount: "",
  occurredDate: toDateInput(new Date().toISOString()),
  notes: "",
};

const movementTypeLabels: Record<AccountMovementType, string> = {
  ADJUSTMENT: "Adjustment",
  TRANSFER: "Transfer",
};

const adjustmentDirectionLabels: Record<AccountAdjustmentDirection, string> = {
  DECREASE: "Decrease",
  INCREASE: "Increase",
};

export function AccountsPage({ accounts, accountMovements, income, payments, onSave, onDelete, onSaveMovement, onDeleteMovement }: AccountsPageProps) {
  const [form, setForm] = useState<FinancialAccountInput>(emptyAccountForm);
  const [movementForm, setMovementForm] = useState<AccountMovementInput>(emptyMovementForm);
  const [error, setError] = useState("");
  const [movementError, setMovementError] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isMovementFormOpen, setIsMovementFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingMovement, setIsSavingMovement] = useState(false);
  const accountTotals = summarizeAccounts(accounts);
  const cashAccounts = useMemo(() => accounts.filter((account) => account.accountType !== "TRADING"), [accounts]);
  const activitiesByAccount = useMemo(
    () => buildAccountActivities(accounts, accountMovements, income, payments),
    [accountMovements, accounts, income, payments],
  );
  const recentMovements = useMemo(() => accountMovements.slice(0, 8), [accountMovements]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);

    try {
      await onSave(form);
      closeForm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save account.");
    } finally {
      setIsSaving(false);
    }
  }

  function openAddForm() {
    setError("");
    setForm(emptyAccountForm);
    setIsFormOpen(true);
  }

  async function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMovementError("");
    setIsSavingMovement(true);

    try {
      await onSaveMovement(movementForm);
      closeMovementForm();
    } catch (caught) {
      setMovementError(caught instanceof Error ? caught.message : "Could not save account movement.");
    } finally {
      setIsSavingMovement(false);
    }
  }

  function openAddMovementForm() {
    setMovementError("");
    setMovementForm({
      ...emptyMovementForm,
      fromAccountId: cashAccounts[0]?.id ?? "",
      toAccountId: cashAccounts[1]?.id ?? "",
      adjustmentAccountId: cashAccounts[0]?.id ?? "",
      occurredDate: toDateInput(new Date().toISOString()),
    });
    setIsMovementFormOpen(true);
  }

  function editMovement(movement: AccountMovement) {
    const isIncrease = Boolean(movement.toAccountId);
    setMovementError("");
    setMovementForm({
      id: movement.id,
      adjustmentAccountId: (isIncrease ? movement.toAccountId : movement.fromAccountId) ?? "",
      adjustmentDirection: isIncrease ? "INCREASE" : "DECREASE",
      amount: centsToInput(movement.amountCents),
      fromAccountId: movement.fromAccountId ?? "",
      movementType: movement.movementType,
      notes: movement.notes,
      occurredDate: toDateInput(movement.occurredAt),
      toAccountId: movement.toAccountId ?? "",
    });
    setIsMovementFormOpen(true);
  }

  function closeMovementForm() {
    setMovementError("");
    setMovementForm(emptyMovementForm);
    setIsMovementFormOpen(false);
  }

  function editAccount(account: FinancialAccount) {
    setError("");
    setForm({
      id: account.id,
      accountType: account.accountType,
      copiedAccounts: account.copiedAccounts,
      feePercent: account.feeBasisPoints === null ? "" : basisPointsToPercent(account.feeBasisPoints),
      institution: account.institution,
      availableBalance: centsToInput(account.availableBalanceCents),
      maxSubAccounts: account.maxSubAccounts === null ? "" : account.maxSubAccounts.toString(),
      name: account.name,
      notes: account.notes,
      payoutLimitPercent: account.payoutLimitBasisPoints === null ? "" : basisPointsToPercent(account.payoutLimitBasisPoints),
      tradingAccountProfits: toProfitInputs(account),
    });
    setIsFormOpen(true);
  }

  function closeForm() {
    setError("");
    setForm(emptyAccountForm);
    setIsFormOpen(false);
  }

  function setAccountType(accountType: FinancialAccountType) {
    setForm((current) => ({
      ...current,
      accountType,
      feePercent: accountType === "TRADING" && !current.feePercent.trim() ? "10" : current.feePercent,
      maxSubAccounts: accountType === "TRADING" && !current.maxSubAccounts.trim() ? "5" : current.maxSubAccounts,
      payoutLimitPercent: accountType === "TRADING" && !current.payoutLimitPercent.trim() ? "50" : current.payoutLimitPercent,
    }));
  }

  function setTradingProfit(index: number, value: string) {
    setForm((current) => {
      const nextProfits = [...current.tradingAccountProfits];
      nextProfits[index] = value;
      return { ...current, tradingAccountProfits: nextProfits };
    });
  }

  return (
    <div className="page-stack accounts-page">
      <section className="summary-strip account-summary-strip">
        <article>
          <span>Bank cash</span>
          <strong>{formatCurrency(accountTotals.bankCashCents)}</strong>
        </article>
        <article>
          <span>Trading profit</span>
          <strong>{formatCurrency(accountTotals.tradingProfitCents)}</strong>
        </article>
        <article>
          <span>Payout capacity</span>
          <strong>{formatCurrency(accountTotals.tradingPayoutCapacityCents)}</strong>
        </article>
      </section>

      <section className="panel accounts-panel">
        <div className="income-toolbar">
          <div>
            <h2>Accounts</h2>
            <p>{accounts.length ? "Bank cash and trading accounts that can fund the plan." : "Add your first bank or trading account."}</p>
          </div>
          <div className="account-toolbar-actions">
            <button className="icon-text-button account-transfer-button" type="button" onClick={openAddMovementForm} disabled={!cashAccounts.length}>
              <ArrowLeftRight size={17} />
              Move cash
            </button>
            <button className="primary-button compact account-add-button" type="button" onClick={openAddForm}>
              <Plus size={17} />
              Add account
            </button>
          </div>
        </div>

        {accounts.length ? (
          <div className="account-grid">
            {accounts.map((account) => {
              const activities = activitiesByAccount.get(account.id) ?? [];
              return (
              <article className="account-card" key={account.id}>
                <div className="account-card-head">
                  <div className="account-card-main">
                    {getAccountIcon(account.accountType)}
                    <div>
                      <strong>{account.name}</strong>
                      <span>
                        {accountTypeLabels[account.accountType]}
                        {account.institution ? ` - ${account.institution}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="account-card-actions">
                    <button className="icon-button" type="button" onClick={() => editAccount(account)} aria-label={`Edit ${account.name}`}>
                      <Edit3 size={15} />
                    </button>
                    <button className="icon-button bad-entry" type="button" onClick={() => void onDelete(account.id)} aria-label={`Delete ${account.name}`}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="account-primary-value">
                  <div>
                    <span>{getPrimaryAccountLabel(account)}</span>
                    <strong>{formatCurrency(getPrimaryAccountAmount(account))}</strong>
                  </div>
                  <span className={`account-type-pill account-type-${account.accountType.toLowerCase()}`}>{accountTypeLabels[account.accountType]}</span>
                </div>

                {account.accountType === "TRADING" && (
                  <>
                    <div className="account-rule-grid">
                      <div>
                        <span>{account.copiedAccounts ? "Profit per account" : "Average account"}</span>
                        <strong>{formatCurrency(getAverageTradingProfit(account))}</strong>
                      </div>
                      <div>
                        <span>Payout capacity</span>
                        <strong>{formatCurrency(getTradingPayoutCapacity(account))}</strong>
                      </div>
                      <div>
                        <span>{account.copiedAccounts ? "Mode" : "Tracking"}</span>
                        <strong>{account.copiedAccounts ? "Copied" : "Separate"}</strong>
                      </div>
                      <div>
                        <span>Accounts</span>
                        <strong>{getTradingAccountProfits(account).length}</strong>
                      </div>
                      <div>
                        <span>Limit</span>
                        <strong>{formatPercent(account.payoutLimitBasisPoints ?? 5000)}</strong>
                      </div>
                      <div>
                        <span>Fee</span>
                        <strong>{formatPercent(account.feeBasisPoints ?? 1000)}</strong>
                      </div>
                    </div>

                    <div className="account-profit-strip" aria-label={`${account.name} trading profits`}>
                      {getTradingAccountProfits(account).map((profitCents, index) => (
                        <span key={`${account.id}:${index}`}>
                          A{index + 1}
                          <strong>{formatCurrency(profitCents)}</strong>
                        </span>
                      ))}
                    </div>
                  </>
                )}

                {account.accountType !== "TRADING" && (
                  <div className="account-rule-grid compact-account-rules">
                    <div>
                      <span>Available cash</span>
                      <strong>{formatCurrency(account.availableBalanceCents)}</strong>
                    </div>
                    <div>
                      <span>Use case</span>
                      <strong>{account.accountType === "BANK" ? "Cash source" : "Other source"}</strong>
                    </div>
                  </div>
                )}

                {account.notes && <p>{account.notes}</p>}

                <section className="account-activity">
                  <div className="account-activity-head">
                    <span>Recent activity</span>
                    <strong>{activities.length ? `${activities.length} shown` : "No movement"}</strong>
                  </div>

                  {activities.length ? (
                    <div className="account-activity-list">
                      {activities.map((activity) => (
                        <article className={`account-activity-item ${activity.tone}`} key={activity.id}>
                          <span className="account-activity-icon">
                            {activity.type === "payment" ? <ReceiptText size={14} /> : activity.tone === "in" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                          </span>
                          <div>
                            <strong>{activity.label}</strong>
                            <span>{activity.meta}</span>
                          </div>
                          <div>
                            <strong>{formatSignedCurrency(activity.amountCents)}</strong>
                            <span>{formatDate(activity.date)} - {formatCurrency(activity.balanceAfterCents)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="account-activity-empty">
                      <span>Deposits, payouts, and payments will appear here.</span>
                    </div>
                  )}
                </section>
              </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state income-empty-state">
            <strong>Add Topstep as a trading account.</strong>
            <span>Then income can record dated payouts from that account with the right payout limit and fee.</span>
          </div>
        )}

        <section className="account-movement-ledger">
          <div className="account-movement-head">
            <div>
              <h3>Cash movement</h3>
              <p>Transfers and balance corrections for bank or cash accounts.</p>
            </div>
            <span>{accountMovements.length} saved</span>
          </div>

          {recentMovements.length ? (
            <div className="account-movement-list">
              {recentMovements.map((movement) => (
                <article className="account-movement-row" key={movement.id}>
                  <span className={`account-movement-mark ${movement.movementType.toLowerCase()}`}>
                    {movement.movementType === "TRANSFER" ? <ArrowLeftRight size={15} /> : <RotateCcw size={15} />}
                  </span>
                  <div>
                    <strong>{formatMovementTitle(movement)}</strong>
                    <span>{formatDate(movement.occurredAt)}{movement.notes ? ` - ${movement.notes}` : ""}</span>
                  </div>
                  <strong>{formatCurrency(movement.amountCents)}</strong>
                  <div className="account-card-actions">
                    <button className="icon-button" type="button" onClick={() => editMovement(movement)} aria-label="Edit account movement">
                      <Edit3 size={15} />
                    </button>
                    <button className="icon-button bad-entry" type="button" onClick={() => void onDeleteMovement(movement.id)} aria-label="Delete account movement">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="account-activity-empty">
              <span>Transfers and manual balance corrections will appear here.</span>
            </div>
          )}
        </section>
      </section>

      {isMovementFormOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel account-modal-panel movement-modal-panel" role="dialog" aria-modal="true" aria-labelledby="movement-form-title">
            <header className="modal-header">
              <div>
                <p>Account movement</p>
                <h2 id="movement-form-title">{movementForm.id ? "Edit movement" : "Move cash"}</h2>
              </div>
              <button className="icon-button" type="button" onClick={closeMovementForm} aria-label="Close movement form">
                <X size={17} />
              </button>
            </header>

            <form className="debt-form" onSubmit={submitMovement}>
              <div className="form-grid two">
                <label className="field-block">
                  Type
                  <select
                    value={movementForm.movementType}
                    onChange={(event) => setMovementForm({ ...movementForm, movementType: event.target.value as AccountMovementType })}
                  >
                    {Object.entries(movementTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  Date
                  <input
                    type="date"
                    value={movementForm.occurredDate}
                    onChange={(event) => setMovementForm({ ...movementForm, occurredDate: event.target.value })}
                  />
                </label>

                {movementForm.movementType === "TRANSFER" ? (
                  <>
                    <label className="field-block">
                      From
                      <select value={movementForm.fromAccountId} onChange={(event) => setMovementForm({ ...movementForm, fromAccountId: event.target.value })}>
                        <option value="">Choose account</option>
                        {cashAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-block">
                      To
                      <select value={movementForm.toAccountId} onChange={(event) => setMovementForm({ ...movementForm, toAccountId: event.target.value })}>
                        <option value="">Choose account</option>
                        {cashAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <>
                    <label className="field-block">
                      Account
                      <select
                        value={movementForm.adjustmentAccountId}
                        onChange={(event) => setMovementForm({ ...movementForm, adjustmentAccountId: event.target.value })}
                      >
                        <option value="">Choose account</option>
                        {cashAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-block">
                      Direction
                      <select
                        value={movementForm.adjustmentDirection}
                        onChange={(event) => setMovementForm({ ...movementForm, adjustmentDirection: event.target.value as AccountAdjustmentDirection })}
                      >
                        {Object.entries(adjustmentDirectionLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}

                <label className="field-block">
                  Amount
                  <input
                    inputMode="decimal"
                    value={movementForm.amount}
                    onChange={(event) => setMovementForm({ ...movementForm, amount: event.target.value })}
                  />
                </label>
              </div>

              <label className="field-block">
                Notes
                <textarea value={movementForm.notes} onChange={(event) => setMovementForm({ ...movementForm, notes: event.target.value })} />
              </label>

              {movementError && <div className="form-error">{movementError}</div>}

              <div className="form-actions">
                <button className="icon-text-button" type="button" onClick={closeMovementForm}>
                  Cancel
                </button>
                <button className="primary-button account-add-button" disabled={isSavingMovement} type="submit">
                  <Save size={17} />
                  {isSavingMovement ? "Saving..." : movementForm.id ? "Save changes" : "Save movement"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {isFormOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel account-modal-panel" role="dialog" aria-modal="true" aria-labelledby="account-form-title">
            <header className="modal-header">
              <div>
                <p>Account details</p>
                <h2 id="account-form-title">{form.id ? "Edit account" : "Add account"}</h2>
              </div>
              <button className="icon-button" type="button" onClick={closeForm} aria-label="Close account form">
                <X size={17} />
              </button>
            </header>

            <form className="debt-form" onSubmit={submit}>
              <div className="form-grid two">
                <label className="field-block">
                  Account name
                  <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </label>
                <label className="field-block">
                  Type
                  <select value={form.accountType} onChange={(event) => setAccountType(event.target.value as FinancialAccountType)}>
                    {Object.entries(accountTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  Institution
                  <input value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} />
                </label>
                {(form.accountType !== "TRADING" || form.copiedAccounts) && (
                  <label className="field-block">
                    {form.accountType === "TRADING" ? "Profit per account" : "Available balance"}
                    <input
                      inputMode="decimal"
                      value={form.availableBalance}
                      onChange={(event) => setForm({ ...form, availableBalance: event.target.value })}
                    />
                  </label>
                )}
                {form.accountType === "TRADING" && (
                  <>
                    <label className="checkbox-row">
                      <input
                        checked={form.copiedAccounts}
                        type="checkbox"
                        onChange={(event) => setForm({ ...form, copiedAccounts: event.target.checked })}
                      />
                      Accounts are copier accounts
                    </label>
                    <label className="field-block">
                      Max accounts
                      <input
                        inputMode="numeric"
                        max={5}
                        min={1}
                        type="number"
                        value={form.maxSubAccounts}
                        onChange={(event) => setForm({ ...form, maxSubAccounts: event.target.value })}
                      />
                    </label>
                    {!form.copiedAccounts &&
                      getAccountIndexes(form.maxSubAccounts).map((accountIndex) => (
                        <label className="field-block" key={accountIndex}>
                          Account {accountIndex + 1} profit
                          <input
                            inputMode="decimal"
                            value={form.tradingAccountProfits[accountIndex] ?? ""}
                            onChange={(event) => setTradingProfit(accountIndex, event.target.value)}
                          />
                        </label>
                      ))}
                    <label className="field-block">
                      Payout limit %
                      <input
                        inputMode="decimal"
                        value={form.payoutLimitPercent}
                        onChange={(event) => setForm({ ...form, payoutLimitPercent: event.target.value })}
                      />
                    </label>
                    <label className="field-block">
                      Fee %
                      <input
                        inputMode="decimal"
                        value={form.feePercent}
                        onChange={(event) => setForm({ ...form, feePercent: event.target.value })}
                      />
                    </label>
                  </>
                )}
              </div>

              <label className="field-block">
                Notes
                <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </label>

              {error && <div className="form-error">{error}</div>}

              <div className="form-actions">
                <button className="icon-text-button" type="button" onClick={closeForm}>
                  Cancel
                </button>
                <button className="primary-button account-add-button" disabled={isSaving} type="submit">
                  <Save size={17} />
                  {isSaving ? "Saving..." : form.id ? "Save changes" : "Add account"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function basisPointsToPercent(value: number) {
  return (value / 100).toString();
}

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function toProfitInputs(account: FinancialAccount) {
  return Array.from({ length: 5 }, (_, index) => {
    const value = account.tradingAccountProfitsCents[index];
    return value === undefined ? "" : centsToInput(value);
  });
}

function getAccountIndexes(value: string) {
  const parsed = Number(value);
  const count = Number.isFinite(parsed) ? Math.min(5, Math.max(1, Math.round(parsed))) : 1;
  return Array.from({ length: count }, (_, index) => index);
}

function getTotalTradingProfit(account: FinancialAccount) {
  if (account.copiedAccounts) {
    return account.availableBalanceCents * Math.max(1, account.maxSubAccounts ?? 1);
  }
  return account.tradingAccountProfitsCents.reduce((sum, value) => sum + value, 0);
}

function getTradingAccountProfits(account: FinancialAccount) {
  if (account.copiedAccounts) {
    return Array.from({ length: Math.max(1, account.maxSubAccounts ?? 1) }, () => account.availableBalanceCents);
  }

  return account.tradingAccountProfitsCents.length ? account.tradingAccountProfitsCents : [0];
}

function getAverageTradingProfit(account: FinancialAccount) {
  const profits = getTradingAccountProfits(account);
  return Math.round(profits.reduce((sum, value) => sum + value, 0) / Math.max(1, profits.length));
}

function getTradingPayoutCapacity(account: FinancialAccount) {
  return Math.round(getTotalTradingProfit(account) * ((account.payoutLimitBasisPoints ?? 5000) / 10000));
}

function getPrimaryAccountLabel(account: FinancialAccount) {
  if (account.accountType === "TRADING") return "Total trading profit";
  if (account.accountType === "BANK") return "Available cash";
  return "Available value";
}

function getPrimaryAccountAmount(account: FinancialAccount) {
  return account.accountType === "TRADING" ? getTotalTradingProfit(account) : account.availableBalanceCents;
}

function summarizeAccounts(accounts: FinancialAccount[]) {
  return accounts.reduce(
    (totals, account) => {
      if (account.accountType === "TRADING") {
        const tradingProfitCents = getTotalTradingProfit(account);
        return {
          ...totals,
          tradingPayoutCapacityCents: totals.tradingPayoutCapacityCents + getTradingPayoutCapacity(account),
          tradingProfitCents: totals.tradingProfitCents + tradingProfitCents,
        };
      }

      return {
        ...totals,
        bankCashCents: totals.bankCashCents + account.availableBalanceCents,
      };
    },
    { bankCashCents: 0, tradingPayoutCapacityCents: 0, tradingProfitCents: 0 },
  );
}

function buildAccountActivities(accounts: FinancialAccount[], accountMovements: AccountMovement[], income: Income[], payments: Payment[]) {
  const activities = new Map<string, Array<Omit<AccountActivity, "balanceAfterCents">>>();

  function add(accountId: string | null, activity: Omit<AccountActivity, "balanceAfterCents">) {
    if (!accountId) return;
    const current = activities.get(accountId) ?? [];
    current.push(activity);
    activities.set(accountId, current);
  }

  for (const item of income) {
    add(item.accountId, {
      amountCents: -item.grossAmountCents,
      date: item.receivedAt,
      id: `${item.id}:source`,
      label: item.sourceType === "TOPSTEP" ? "Trading payout" : "Income withdrawn",
      meta: item.destinationAccountName ? `To ${item.destinationAccountName}` : item.source,
      tone: "out",
      type: "income",
    });

    add(item.destinationAccountId, {
      amountCents: item.netAmountCents,
      date: item.receivedAt,
      id: `${item.id}:destination`,
      label: "Income deposit",
      meta: item.accountName ? `From ${item.accountName}` : item.source,
      tone: "in",
      type: "income",
    });
  }

  for (const payment of payments) {
    add(payment.accountId, {
      amountCents: -payment.amountCents,
      date: payment.paidAt,
      id: `${payment.id}:payment`,
      label: "Debt payment",
      meta: payment.debtName ?? "Removed debt",
      tone: "out",
      type: "payment",
    });
  }

  for (const movement of accountMovements) {
    add(movement.fromAccountId, {
      amountCents: -movement.amountCents,
      date: movement.occurredAt,
      id: `${movement.id}:from`,
      label: movement.movementType === "TRANSFER" ? "Transfer sent" : "Balance decrease",
      meta: movement.movementType === "TRANSFER" ? `To ${movement.toAccountName ?? "removed account"}` : movement.notes || "Manual correction",
      tone: "out",
      type: "movement",
    });

    add(movement.toAccountId, {
      amountCents: movement.amountCents,
      date: movement.occurredAt,
      id: `${movement.id}:to`,
      label: movement.movementType === "TRANSFER" ? "Transfer received" : "Balance increase",
      meta: movement.movementType === "TRANSFER" ? `From ${movement.fromAccountName ?? "removed account"}` : movement.notes || "Manual correction",
      tone: "in",
      type: "movement",
    });
  }

  const withBalances = new Map<string, AccountActivity[]>();

  for (const account of accounts) {
    const accountActivities = (activities.get(account.id) ?? []).sort(
      (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
    );
    let balanceCursor = getPrimaryAccountAmount(account);
    const recentActivities = accountActivities.slice(0, 4).map((activity) => {
      const balanceAfterCents = balanceCursor;
      balanceCursor -= activity.amountCents;
      return { ...activity, balanceAfterCents };
    });
    withBalances.set(account.id, recentActivities);
  }

  return withBalances;
}

function getAccountIcon(accountType: FinancialAccountType) {
  if (accountType === "BANK") return <Landmark size={18} />;
  if (accountType === "TRADING") return <ChartNoAxesColumnIncreasing size={18} />;
  return <Building2 size={18} />;
}

function formatMovementTitle(movement: AccountMovement) {
  if (movement.movementType === "TRANSFER") {
    return `${movement.fromAccountName ?? "Removed account"} to ${movement.toAccountName ?? "Removed account"}`;
  }
  const accountName = movement.toAccountName ?? movement.fromAccountName ?? "Removed account";
  return `${movement.toAccountId ? "Increase" : "Decrease"} ${accountName}`;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}

function formatSignedCurrency(cents: number) {
  const formatted = formatCurrency(Math.abs(cents));
  if (cents > 0) return `+${formatted}`;
  if (cents < 0) return `-${formatted}`;
  return formatted;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(new Date(value));
}

function toDateInput(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatPercent(value: number) {
  return `${value / 100}%`;
}
