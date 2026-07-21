import { AlertTriangle, Banknote, CalendarDays, Edit3, Plus, Save, Trash2, X } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type { FinancialAccount, Income, IncomeInput, IncomeSourceType, TopstepPayoutScope } from "../../types";

type IncomePageProps = {
  financialAccounts: FinancialAccount[];
  income: Income[];
  onSave: (input: IncomeInput) => Promise<void>;
  onDelete: (incomeId: string) => Promise<void>;
};

const emptyForm: IncomeInput = {
  accountId: "",
  destinationAccountId: "",
  source: "",
  sourceType: "EMPLOYMENT",
  grossAmount: "",
  fees: "",
  taxWithholding: "",
  allocatedAmount: "",
  topstepAccountCount: "5",
  topstepCopiedAccounts: true,
  topstepPayoutScope: "ALL_ACCOUNTS",
  topstepSelectedAccount: "1",
  topstepProfitPerAccount: "",
  receivedDate: toDateInput(new Date().toISOString()),
  notes: "",
};

const sourceTypeLabels: Record<IncomeSourceType, string> = {
  EMPLOYMENT: "Employment",
  TOPSTEP: "Trading income",
  BUSINESS: "Business",
  REFUND: "Refund",
  BENEFITS: "Benefits",
  OTHER: "Other",
};

const payoutScopeLabels: Record<TopstepPayoutScope, string> = {
  ALL_ACCOUNTS: "All accounts",
  SINGLE_ACCOUNT: "One account",
};

export function IncomePage({ financialAccounts, income, onSave, onDelete }: IncomePageProps) {
  const [form, setForm] = useState<IncomeInput>(emptyForm);
  const [error, setError] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const totals = useMemo(() => {
    const gross = income.reduce((sum, item) => sum + item.grossAmountCents, 0);
    const net = income.reduce((sum, item) => sum + item.netAmountCents, 0);
    const allocated = income.reduce((sum, item) => sum + item.allocatedAmountCents, 0);
    return {
      allocated,
      entries: income.length,
      gross,
      net,
      overallocatedEntries: income.filter((item) => item.remainingAmountCents < 0).length,
      remaining: net - allocated,
    };
  }, [income]);
  const selectedAccount = financialAccounts.find((account) => account.id === form.accountId);
  const cashAccounts = financialAccounts.filter((account) => account.accountType !== "TRADING");
  const accountCashCents = cashAccounts.reduce((sum, account) => sum + account.availableBalanceCents, 0);
  const editedIncome = form.id ? income.find((item) => item.id === form.id) : undefined;
  const previewAccount = selectedAccount ? restoreAccountForEditedIncome(selectedAccount, editedIncome) : undefined;
  const usesTradingRules = form.sourceType === "TOPSTEP" || selectedAccount?.accountType === "TRADING";
  const formPreview = getIncomePreview(form, previewAccount);
  const tradingPreview = getTopstepProjection(form, previewAccount);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);

    try {
      await onSave(form);
      closeForm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save income.");
    } finally {
      setIsSaving(false);
    }
  }

  function openAddForm() {
    setError("");
    setForm(emptyForm);
    setIsFormOpen(true);
  }

  function editIncome(item: Income) {
    setError("");
    setForm({
      id: item.id,
      accountId: item.accountId ?? "",
      destinationAccountId: item.destinationAccountId ?? "",
      source: item.source,
      sourceType: item.sourceType,
      grossAmount: centsToInput(getEditableGrossAmountCents(item)),
      fees: item.feesCents ? centsToInput(item.feesCents) : "",
      taxWithholding: item.taxWithholdingCents ? centsToInput(item.taxWithholdingCents) : "",
      allocatedAmount: item.allocatedAmountCents ? centsToInput(item.allocatedAmountCents) : "",
      topstepAccountCount: item.topstepAccountCount?.toString() ?? "5",
      topstepCopiedAccounts: item.topstepCopiedAccounts,
      topstepPayoutScope: item.topstepPayoutScope ?? "ALL_ACCOUNTS",
      topstepSelectedAccount: item.topstepSelectedAccount?.toString() ?? "1",
      topstepProfitPerAccount: item.topstepProfitPerAccountCents === null ? "" : centsToInput(item.topstepProfitPerAccountCents),
      receivedDate: toDateInput(item.receivedAt),
      notes: item.notes,
    });
    setIsFormOpen(true);
  }

  function closeForm() {
    setError("");
    setForm(emptyForm);
    setIsFormOpen(false);
  }

  function setSourceType(sourceType: IncomeSourceType) {
    const nextForm = {
      ...form,
      source: sourceType === "TOPSTEP" && !form.source.trim() ? selectedAccount?.name ?? "Trading income" : form.source,
      sourceType,
    };
    setForm(sourceType === "TOPSTEP" ? applyTopstepProjection(nextForm, previewAccount) : nextForm);
  }

  function setTopstepForm(patch: Partial<IncomeInput>) {
    setForm((current) => {
      const nextAccount = financialAccounts.find((account) => account.id === (patch.accountId ?? current.accountId));
      const currentEditedIncome = current.id ? income.find((item) => item.id === current.id) : undefined;
      return applyTopstepProjection({ ...current, ...patch, sourceType: "TOPSTEP" }, nextAccount ? restoreAccountForEditedIncome(nextAccount, currentEditedIncome) : undefined);
    });
  }

  function setAccount(accountId: string) {
    const account = financialAccounts.find((item) => item.id === accountId);
    const nextForm = {
      ...form,
      accountId,
      source: account && (!form.source.trim() || form.source === selectedAccount?.name) ? account.name : form.source,
      sourceType: account?.accountType === "TRADING" ? "TOPSTEP" : form.sourceType,
      topstepAccountCount: account?.accountType === "TRADING" ? (account.maxSubAccounts ?? 1).toString() : form.topstepAccountCount,
    };
    const nextPreviewAccount = account ? restoreAccountForEditedIncome(account, form.id ? income.find((item) => item.id === form.id) : undefined) : undefined;
    setForm(account?.accountType === "TRADING" ? applyTopstepProjection(nextForm, nextPreviewAccount) : nextForm);
  }

  return (
    <div className="page-stack income-page">
      <section className="summary-strip income-summary-strip">
        <article>
          <span>Gross received</span>
          <strong>{formatCurrency(totals.gross)}</strong>
        </article>
        <article>
          <span>Net received</span>
          <strong>{formatCurrency(totals.net)}</strong>
        </article>
        <article>
          <span>Assigned</span>
          <strong>{formatCurrency(totals.allocated)}</strong>
        </article>
        <article>
          <span>Available cash</span>
          <strong className={accountCashCents < 0 ? "warning-text" : ""}>{formatCurrency(accountCashCents)}</strong>
        </article>
      </section>

      <section className="panel income-panel">
        <div className="income-toolbar">
          <div>
            <h2>Income</h2>
            <p>{income.length ? "Money received and ready to plan from." : "Add your first source of income."}</p>
          </div>
          <button className="primary-button compact income-add-button" type="button" onClick={openAddForm}>
            <Plus size={17} />
            Add income
          </button>
        </div>

        {totals.remaining < 0 && (
          <div className="allocation-warning">
            <AlertTriangle size={17} />
            <span>
              Assigned money is over available income by {formatCurrency(Math.abs(totals.remaining))}.
              {totals.overallocatedEntries ? ` ${totals.overallocatedEntries} income record${totals.overallocatedEntries === 1 ? "" : "s"} need review.` : ""}
            </span>
          </div>
        )}

        {income.length ? (
          <div className="income-lines">
            {income.map((item) => (
              <article className="income-line" key={item.id}>
                <div className="income-source">
                  <Banknote size={17} />
                  <div>
                    <div className="income-title-row">
                      <strong>{item.source}</strong>
                      <span className={`income-type-pill income-type-${item.sourceType.toLowerCase()}`}>
                        {sourceTypeLabels[item.sourceType]}
                      </span>
                      {item.notes && (
                        <span
                          aria-label={`Notes for ${item.source}`}
                          className="note-tooltip income-note-tooltip"
                          data-tooltip={item.notes}
                          tabIndex={0}
                          title={item.notes}
                        >
                          !
                        </span>
                      )}
                    </div>
                    <div className="income-meta-strip">
                      {getIncomeMetaChips(item).map((chip) => (
                        <span className={chip.tone === "danger" ? "income-meta-warning" : ""} key={chip.label}>
                          {chip.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="income-breakdown">
                  <span>{item.sourceType === "TOPSTEP" ? "Total payout" : "Gross"}</span>
                  <strong>{formatCurrency(item.grossAmountCents)}</strong>
                </div>

                <div className="income-date">
                  <CalendarDays size={16} />
                  <span>{formatDate(item.receivedAt)}</span>
                </div>

                <div className="income-net">
                  <span>Net</span>
                  <strong>{formatCurrency(item.netAmountCents)}</strong>
                </div>

                <div className="income-net">
                  <span>Remaining</span>
                  <strong className={item.remainingAmountCents < 0 ? "warning-text" : ""}>
                    {formatCurrency(item.remainingAmountCents)}
                  </strong>
                </div>

                <div className="table-actions">
                  <button className="icon-button" type="button" onClick={() => editIncome(item)} aria-label={`Edit ${item.source}`}>
                    <Edit3 size={15} />
                  </button>
                  <button className="icon-button bad-entry" type="button" onClick={() => void onDelete(item.id)} aria-label={`Delete ${item.source}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state income-empty-state">
            <strong>Start with your next paycheck, payout, or transfer.</strong>
            <span>GoXPlan will separate gross, fees, assigned money, and cash still available to plan.</span>
          </div>
        )}
      </section>

      {isFormOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel income-modal-panel" role="dialog" aria-modal="true" aria-labelledby="income-form-title">
            <header className="modal-header">
              <div>
                <p>Income details</p>
                <h2 id="income-form-title">{form.id ? "Edit income" : "Add income"}</h2>
              </div>
              <button className="icon-button" type="button" onClick={closeForm} aria-label="Close income form">
                <X size={17} />
              </button>
            </header>

            <form className="debt-form" onSubmit={submit}>
              <div className="form-grid two">
                <label className="field-block">
                  From account
                  <select value={form.accountId} onChange={(event) => setAccount(event.target.value)}>
                    <option value="">No source account</option>
                    {financialAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {getAccountOptionLabel(account)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  Description
                  <input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} />
                </label>
              </div>

              <div className="form-grid two">
                <label className="field-block">
                  Deposit to
                  <select value={form.destinationAccountId} onChange={(event) => setForm({ ...form, destinationAccountId: event.target.value })}>
                    <option value="">No destination account</option>
                    {cashAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {getAccountOptionLabel(account)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  Income type
                  <select
                    value={form.sourceType}
                    onChange={(event) => setSourceType(event.target.value as IncomeSourceType)}
                  >
                    {Object.entries(sourceTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {usesTradingRules && (
                <section className="topstep-calculator">
                  <div className="topstep-calculator-heading">
                    <strong>Trading account rules</strong>
                    <span>
                      You can record up to {formatPercent(getPayoutLimitBasisPoints(previewAccount))} of profit. Fee is{" "}
                      {formatPercent(getFeeBasisPoints(previewAccount))} of the amount taken.
                    </span>
                  </div>

                  <div className="form-grid two">
                    <label className="field-block">
                      Accounts
                      <input
                        inputMode="numeric"
                        max={5}
                        min={1}
                        type="number"
                        value={form.topstepAccountCount}
                        onChange={(event) => setTopstepForm({ topstepAccountCount: event.target.value })}
                      />
                    </label>
                    <label className="field-block">
                      Payout from
                      <select
                        value={form.topstepPayoutScope}
                        onChange={(event) => setTopstepForm({ topstepPayoutScope: event.target.value as TopstepPayoutScope })}
                      >
                        {Object.entries(payoutScopeLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {form.topstepPayoutScope === "SINGLE_ACCOUNT" && (
                      <label className="field-block">
                        Account number
                        <input
                          inputMode="numeric"
                          max={Math.min(5, Math.max(1, Number(form.topstepAccountCount) || 1))}
                          min={1}
                          type="number"
                          value={form.topstepSelectedAccount}
                          onChange={(event) => setTopstepForm({ topstepSelectedAccount: event.target.value })}
                        />
                      </label>
                    )}
                    {!previewAccount && (
                      <label className="field-block">
                        Profit per account
                        <input
                          inputMode="decimal"
                          value={form.topstepProfitPerAccount}
                          onChange={(event) => setTopstepForm({ topstepProfitPerAccount: event.target.value })}
                        />
                      </label>
                    )}
                  </div>

                  {!previewAccount && (
                    <label className="checkbox-row">
                      <input
                        checked={form.topstepCopiedAccounts}
                        type="checkbox"
                        onChange={(event) => setTopstepForm({ topstepCopiedAccounts: event.target.checked })}
                      />
                      Copier accounts use the same profit
                    </label>
                  )}

                  <div className="topstep-payout-preview">
                    {getTopstepPreviewRows(form, previewAccount).map((row) => (
                      <div key={row.label}>
                        <span>{row.label}</span>
                        <strong>{formatCurrency(row.value)}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <div className="form-grid two">
                <label className="field-block">
                  {usesTradingRules && form.topstepPayoutScope === "ALL_ACCOUNTS" ? "Amount taken per account" : usesTradingRules ? "Amount taken" : "Gross amount"}
                  <input
                    inputMode="decimal"
                    value={form.grossAmount}
                    onChange={(event) =>
                      usesTradingRules
                        ? setTopstepForm({ grossAmount: event.target.value })
                        : setForm({ ...form, grossAmount: event.target.value })
                    }
                  />
                </label>
                <label className="field-block">
                  Fees
                  <input
                    inputMode="decimal"
                    readOnly={usesTradingRules}
                    value={form.fees}
                    onChange={(event) => setForm({ ...form, fees: event.target.value })}
                  />
                </label>
                <label className="field-block">
                  Tax withholding
                  <input
                    inputMode="decimal"
                    value={form.taxWithholding}
                    onChange={(event) => setForm({ ...form, taxWithholding: event.target.value })}
                  />
                </label>
                <label className="field-block">
                  Allocated amount
                  <input
                    inputMode="decimal"
                    value={form.allocatedAmount}
                    onChange={(event) => setForm({ ...form, allocatedAmount: event.target.value })}
                  />
                </label>
                <label className="field-block">
                  {usesTradingRules ? "Income date" : "Received date"}
                  <input
                    type="date"
                    value={form.receivedDate}
                    onChange={(event) => setForm({ ...form, receivedDate: event.target.value })}
                  />
                </label>
              </div>

              <div className="income-form-preview">
                <div>
                  <span>Deposit amount</span>
                  <strong>{formatCurrency(formPreview.net)}</strong>
                </div>
                <div>
                  <span>Unassigned</span>
                  <strong className={formPreview.remaining < 0 ? "warning-text" : ""}>{formatCurrency(formPreview.remaining)}</strong>
                </div>
              </div>

              {formPreview.remaining < 0 && (
                <div className="allocation-warning compact-warning">
                  <AlertTriangle size={16} />
                  <span>This income entry assigns {formatCurrency(Math.abs(formPreview.remaining))} more than its net amount.</span>
                </div>
              )}

              {usesTradingRules && getTradingGrossAmount(form) > tradingPreview.withdrawableCents && (
                <div className="allocation-warning compact-warning">
                  <AlertTriangle size={16} />
                  <span>Total payout is higher than the selected payout limit of {formatCurrency(tradingPreview.withdrawableCents)}.</span>
                </div>
              )}

              <label className="field-block">
                Notes
                <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </label>

              {error && <div className="form-error">{error}</div>}

              <div className="form-actions">
                <button className="icon-text-button" type="button" onClick={closeForm}>
                  Cancel
                </button>
                <button className="primary-button income-add-button" disabled={isSaving} type="submit">
                  <Save size={17} />
                  {isSaving ? "Saving..." : form.id ? "Save changes" : "Add income"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function toDateInput(value: string) {
  return value ? value.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function getEditableGrossAmountCents(item: Income) {
  if (item.sourceType === "TOPSTEP" && item.topstepPayoutScope === "ALL_ACCOUNTS") {
    return Math.round(item.grossAmountCents / Math.max(1, item.topstepAccountCount ?? 1));
  }

  return item.grossAmountCents;
}

function restoreAccountForEditedIncome(account: FinancialAccount, editedIncome?: Income) {
  if (!editedIncome || editedIncome.accountId !== account.id) return account;

  if (account.accountType !== "TRADING") {
    return {
      ...account,
      availableBalanceCents: account.availableBalanceCents + editedIncome.grossAmountCents,
    };
  }

  const accountCount = Math.max(1, Math.min(5, account.maxSubAccounts ?? editedIncome.topstepAccountCount ?? 1));
  const currentProfits = account.tradingAccountProfitsCents.length
    ? account.tradingAccountProfitsCents
    : Array.from({ length: accountCount }, () => account.availableBalanceCents);
  const restoredProfits = Array.from({ length: accountCount }, (_, index) => currentProfits[index] ?? account.availableBalanceCents);
  const amountPerAccountCents =
    editedIncome.topstepPayoutScope === "ALL_ACCOUNTS"
      ? Math.round(editedIncome.grossAmountCents / Math.max(1, editedIncome.topstepAccountCount ?? 1))
      : editedIncome.grossAmountCents;
  const indexes =
    editedIncome.topstepPayoutScope === "ALL_ACCOUNTS"
      ? Array.from({ length: Math.min(editedIncome.topstepAccountCount ?? accountCount, accountCount) }, (_, index) => index)
      : [Math.min(accountCount - 1, Math.max(0, (editedIncome.topstepSelectedAccount ?? 1) - 1))];

  for (const index of indexes) {
    restoredProfits[index] = restoredProfits[index] + amountPerAccountCents;
  }

  return {
    ...account,
    availableBalanceCents: restoredProfits[0] ?? account.availableBalanceCents,
    copiedAccounts: restoredProfits.every((profit) => profit === restoredProfits[0]),
    tradingAccountProfitsCents: restoredProfits,
  };
}

function getIncomePreview(input: IncomeInput, account?: FinancialAccount) {
  const gross = account?.accountType === "TRADING" || input.sourceType === "TOPSTEP" ? getTradingGrossAmount(input) : parseMoney(input.grossAmount);
  const fees = parseMoney(input.fees);
  const tax = parseMoney(input.taxWithholding);
  const allocated = parseMoney(input.allocatedAmount);
  const net = gross - fees - tax;
  return {
    net,
    remaining: net - allocated,
  };
}

function applyTopstepProjection(input: IncomeInput, account?: FinancialAccount): IncomeInput {
  const projection = getTopstepProjection(input, account);
  return {
    ...input,
    fees: projection.feeCents ? centsToInput(projection.feeCents) : "",
    topstepAccountCount: projection.accountCount.toString(),
    topstepSelectedAccount: projection.selectedAccount.toString(),
  };
}

function getTopstepPreviewRows(input: IncomeInput, account?: FinancialAccount) {
  const projection = getTopstepProjection(input, account);
  const isAllAccounts = input.topstepPayoutScope === "ALL_ACCOUNTS";
  return [
    { label: account ? "Available profit" : "Total profit", value: projection.totalProfitCents },
    { label: isAllAccounts ? "Selected limit" : "Payout limit", value: projection.withdrawableCents },
    { label: isAllAccounts ? "Amount/account" : "Amount taken", value: parseMoney(input.grossAmount) },
    { label: "Total payout", value: getTradingGrossAmount(input) },
    { label: "Fee", value: projection.feeCents },
  ];
}

function getTopstepProjection(input: IncomeInput, account?: FinancialAccount) {
  const accountLimit = Math.min(5, Math.max(1, account?.maxSubAccounts ?? 5));
  const accountCount = clampWholeNumber(input.topstepAccountCount, 1, accountLimit);
  const selectedAccount = clampWholeNumber(input.topstepSelectedAccount, 1, accountCount);
  const paidAccounts = input.topstepPayoutScope === "ALL_ACCOUNTS" ? accountCount : 1;
  const profitPerAccountCents = parseMoney(input.topstepProfitPerAccount);
  const totalProfitCents = account ? getAvailableProfitForPayout(account, input.topstepPayoutScope, accountCount, selectedAccount) : profitPerAccountCents * paidAccounts;
  const withdrawableCents = Math.round(totalProfitCents * (getPayoutLimitBasisPoints(account) / 10000));
  const feeCents = Math.round(getTradingGrossAmount(input) * (getFeeBasisPoints(account) / 10000));

  return {
    accountCount,
    feeCents,
    selectedAccount,
    totalProfitCents,
    withdrawableCents,
  };
}

function getTradingGrossAmount(input: IncomeInput) {
  const amountPerAccountCents = parseMoney(input.grossAmount);
  if (input.topstepPayoutScope !== "ALL_ACCOUNTS") return amountPerAccountCents;
  return amountPerAccountCents * clampWholeNumber(input.topstepAccountCount, 1, 5);
}

function getAvailableProfitForPayout(account: FinancialAccount, payoutScope: TopstepPayoutScope, accountCount: number, selectedAccount: number) {
  const profits = account.tradingAccountProfitsCents.length
    ? account.tradingAccountProfitsCents
    : Array.from({ length: Math.max(1, accountCount) }, () => account.availableBalanceCents);

  if (payoutScope === "SINGLE_ACCOUNT") {
    return profits[Math.min(profits.length - 1, Math.max(0, selectedAccount - 1))] ?? account.availableBalanceCents;
  }

  return profits.slice(0, Math.max(1, accountCount)).reduce((sum, value) => sum + value, 0);
}

function getPayoutLimitBasisPoints(account?: FinancialAccount) {
  return account?.payoutLimitBasisPoints ?? 5000;
}

function getFeeBasisPoints(account?: FinancialAccount) {
  return account?.feeBasisPoints ?? 1000;
}

function clampWholeNumber(value: string, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function getIncomeMetaChips(item: Income) {
  const chips: Array<{ label: string; tone?: "danger" }> = [];

  if (item.accountName) {
    chips.push({ label: `From ${item.accountName}` });
  }

  if (item.destinationAccountName) {
    chips.push({ label: `To ${item.destinationAccountName}` });
  }

  if (item.sourceType === "TOPSTEP") {
    const accountCount = Math.max(1, item.topstepAccountCount ?? 1);
    const payoutScope =
      item.topstepPayoutScope === "SINGLE_ACCOUNT" ? `Account ${item.topstepSelectedAccount ?? 1}` : `${accountCount} accounts`;
    chips.push({ label: payoutScope });

    if (item.topstepPayoutScope === "ALL_ACCOUNTS") {
      chips.push({ label: `${formatCurrency(getEditableGrossAmountCents(item))}/account` });
    }

    if (item.feesCents) {
      chips.push({ label: `${formatCurrency(item.feesCents)} fee` });
    }
  }

  if (item.remainingAmountCents < 0) {
    chips.push({ label: "Overassigned", tone: "danger" });
  }

  return chips.length ? chips : [{ label: "No accounts linked" }];
}

function getAccountOptionLabel(account: FinancialAccount) {
  const type = account.accountType === "BANK" ? "Bank" : account.accountType === "TRADING" ? "Trading" : "Cash";
  return `${account.name} - ${type} - ${formatCurrency(account.availableBalanceCents)}`;
}

function formatPercent(basisPoints: number) {
  return `${basisPoints / 100}%`;
}

function parseMoney(value: string) {
  const parsed = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}
