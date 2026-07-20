import { Building2, Edit3, Plus, Save, Trash2, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { FinancialAccount, FinancialAccountInput, FinancialAccountType } from "../../types";

type AccountsPageProps = {
  accounts: FinancialAccount[];
  onSave: (input: FinancialAccountInput) => Promise<void>;
  onDelete: (accountId: string) => Promise<void>;
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

export function AccountsPage({ accounts, onSave, onDelete }: AccountsPageProps) {
  const [form, setForm] = useState<FinancialAccountInput>(emptyAccountForm);
  const [error, setError] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
      <section className="panel accounts-panel">
        <div className="income-toolbar">
          <div>
            <h2>Accounts</h2>
            <p>{accounts.length ? "Places money can come from or move through." : "Add your first bank or trading account."}</p>
          </div>
          <button className="primary-button compact account-add-button" type="button" onClick={openAddForm}>
            <Plus size={17} />
            Add account
          </button>
        </div>

        {accounts.length ? (
          <div className="account-grid">
            {accounts.map((account) => (
              <article className="account-card" key={account.id}>
                <div className="account-card-main">
                  <Building2 size={18} />
                  <div>
                    <strong>{account.name}</strong>
                    <span>
                      {accountTypeLabels[account.accountType]}
                      {account.institution ? ` - ${account.institution}` : ""}
                    </span>
                  </div>
                </div>

                {account.accountType === "TRADING" && (
                  <div className="account-rule-grid">
                    <div>
                      <span>{account.copiedAccounts ? "Profit per account" : "Total profit"}</span>
                      <strong>{formatCurrency(account.copiedAccounts ? account.availableBalanceCents : getTotalTradingProfit(account))}</strong>
                    </div>
                    {account.copiedAccounts && (
                      <div>
                        <span>Total profit</span>
                        <strong>{formatCurrency(getTotalTradingProfit(account))}</strong>
                      </div>
                    )}
                    <div>
                      <span>Mode</span>
                      <strong>{account.copiedAccounts ? "Copied" : "Separate"}</strong>
                    </div>
                    <div>
                      <span>Accounts</span>
                      <strong>{account.maxSubAccounts ?? 1}</strong>
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
                )}

                {account.accountType !== "TRADING" && (
                  <div className="account-rule-grid compact-account-rules">
                    <div>
                      <span>Available</span>
                      <strong>{formatCurrency(account.availableBalanceCents)}</strong>
                    </div>
                  </div>
                )}

                {account.notes && <p>{account.notes}</p>}

                <div className="account-card-actions">
                  <button className="icon-button" type="button" onClick={() => editAccount(account)} aria-label={`Edit ${account.name}`}>
                    <Edit3 size={15} />
                  </button>
                  <button className="icon-button bad-entry" type="button" onClick={() => void onDelete(account.id)} aria-label={`Delete ${account.name}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state income-empty-state">
            <strong>Add Topstep as a trading account.</strong>
            <span>Then income can record dated payouts from that account with the right payout limit and fee.</span>
          </div>
        )}
      </section>

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

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}

function formatPercent(value: number) {
  return `${value / 100}%`;
}
