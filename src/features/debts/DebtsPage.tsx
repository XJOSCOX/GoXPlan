import { Edit3, FileUp, Info, Plus, Save, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { getDebtPriorityLevel, priorityLevelRanges } from "../../lib/debtPriority";
import { getDebtPlanningTarget, getDebtRemainingCents, getDebtSettlementSavingsCents, summarizePayments } from "../../lib/financialSummary";
import { buildNegotiationInsights, type DebtNegotiationInsight } from "../../lib/negotiationTargets";
import type { Debt, DebtCategory, DebtInput, DebtPriorityLevel, DebtStatus, Negotiation, Payment } from "../../types";

type DebtsPageProps = {
  debts: Debt[];
  negotiations: Negotiation[];
  payments: Payment[];
  onImportKnownDebts: () => Promise<void>;
  onSave: (input: DebtInput) => Promise<void>;
  onDelete: (debtId: string) => Promise<void>;
  onOpenDebt: (debtId: string) => void;
};

type DebtSortMode = "priority" | "creditor" | "balance-desc" | "balance-asc" | "tracked-desc" | "target-asc";
type ReportedFilter = "ALL" | "REPORTED" | "NOT_REPORTED";

const emptyForm: DebtInput = {
  priority: 1,
  priorityScore: 0,
  trackedDate: toDateInput(new Date().toISOString()),
  creditorName: "",
  category: "OTHER",
  balance: "",
  settlement: "",
  pastDue: "",
  apr: "",
  minimumPayment: "",
  monthsBehind: "",
  targetDate: "",
  settlementExpiresDate: "",
  status: "OPEN",
  reported: false,
  payForDelete: false,
  negotiable: true,
  reason: "",
  notes: "",
};

const pageSize = 10;

const statusLabels: Record<DebtStatus, string> = {
  OPEN: "Open",
  PAST_DUE: "Past due",
  COLLECTION: "Collection",
  CLOSED: "Closed",
  NOT_REPORTED: "Not reported",
  SETTLED: "Settled",
};

const categoryLabels: Record<DebtCategory, string> = {
  AUTO_LOAN: "Auto loan",
  CREDIT_CARD: "Credit card",
  COLLECTION: "Collection",
  PERSONAL_LOAN: "Personal loan",
  BNPL: "Buy now, pay later",
  RETAIL_FINANCING: "Retail financing",
  MEDICAL: "Medical",
  UTILITY: "Utility",
  OTHER: "Other",
};

const priorityScoreByLevel = priorityLevelRanges.reduce(
  (scores, range) => ({ ...scores, [range.level]: range.min }),
  {} as Record<DebtPriorityLevel, number>,
);

export function DebtsPage({ debts, negotiations, payments, onImportKnownDebts, onSave, onDelete, onOpenDebt }: DebtsPageProps) {
  const [form, setForm] = useState<DebtInput>(emptyForm);
  const [error, setError] = useState("");
  const [importError, setImportError] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | DebtStatus>("ALL");
  const [levelFilter, setLevelFilter] = useState<"ALL" | DebtPriorityLevel>("ALL");
  const [reportedFilter, setReportedFilter] = useState<ReportedFilter>("ALL");
  const [sortMode, setSortMode] = useState<DebtSortMode>("priority");

  const paymentSummary = useMemo(() => summarizePayments(payments), [payments]);
  const negotiationInsights = useMemo(() => buildNegotiationInsights(negotiations), [negotiations]);
  const totals = useMemo(() => {
    const balance = debts.reduce((sum, debt) => sum + debt.balanceCents, 0);
    const currentPayoff = debts.reduce((sum, debt) => sum + getCurrentPayoffCents(debt, paymentSummary, negotiationInsights.get(debt.id)), 0);
    const savings = debts.reduce((sum, debt) => sum + getDebtFigures(debt, paymentSummary, negotiationInsights.get(debt.id)).savingsCents, 0);

    return {
      balance,
      currentPayoff,
      savings,
      reported: debts.filter((debt) => debt.reported).length,
    };
  }, [debts, negotiationInsights, paymentSummary]);

  const filteredDebts = useMemo(() => {
    const searchText = search.trim().toLowerCase();
    const matchesSearch = (debt: Debt) => {
      if (!searchText) return true;
      return [
        debt.creditorName,
        categoryLabels[debt.category],
        debt.reason,
        debt.notes,
        statusLabels[debt.status],
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchText);
    };

    const scopedDebts = debts.filter((debt) => {
      const level = getDebtPriorityLevel(debt.priorityScore);
      if (!matchesSearch(debt)) return false;
      if (statusFilter !== "ALL" && debt.status !== statusFilter) return false;
      if (levelFilter !== "ALL" && level !== levelFilter) return false;
      if (reportedFilter === "REPORTED" && !debt.reported) return false;
      if (reportedFilter === "NOT_REPORTED" && debt.reported) return false;
      return true;
    });

    if (sortMode === "priority") {
      return priorityLevelRanges.flatMap((range) =>
        scopedDebts
          .filter((debt) => getDebtPriorityLevel(debt.priorityScore) === range.level)
          .sort((a, b) => a.priority - b.priority || b.priorityScore - a.priorityScore || a.creditorName.localeCompare(b.creditorName)),
      );
    }

    return [...scopedDebts].sort((a, b) => compareDebts(a, b, sortMode, paymentSummary, negotiationInsights));
  }, [debts, levelFilter, negotiationInsights, paymentSummary, reportedFilter, search, sortMode, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredDebts.length / pageSize));
  const pageDebts = filteredDebts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageStart = filteredDebts.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, filteredDebts.length);
  const visibleLevelGroups = priorityLevelRanges
    .map((range) => ({
      level: range.level,
      debts: pageDebts.filter((debt) => getDebtPriorityLevel(debt.priorityScore) === range.level),
    }))
    .filter((group) => group.debts.length > 0);

  useEffect(() => {
    setCurrentPage(1);
  }, [levelFilter, reportedFilter, search, sortMode, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);

    try {
      await onSave(form);
      closeForm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save debt.");
    } finally {
      setIsSaving(false);
    }
  }

  function editDebt(debt: Debt) {
    setError("");
    setForm({
      id: debt.id,
      priority: debt.priority,
      priorityScore: debt.priorityScore,
      trackedDate: toDateInput(debt.trackedAt),
      creditorName: debt.creditorName,
      category: debt.category,
      balance: centsToInput(debt.balanceCents),
      settlement: debt.settlementCents === null ? "" : centsToInput(debt.settlementCents),
      pastDue: debt.pastDueCents === null ? "" : centsToInput(debt.pastDueCents),
      apr: debt.aprBasisPoints === null ? "" : (debt.aprBasisPoints / 100).toString(),
      minimumPayment: debt.minimumPaymentCents === null ? "" : centsToInput(debt.minimumPaymentCents),
      monthsBehind: debt.monthsBehind === null ? "" : debt.monthsBehind.toString(),
      targetDate: debt.targetDate ? toDateInput(debt.targetDate) : "",
      settlementExpiresDate: debt.settlementExpiresAt ? toDateInput(debt.settlementExpiresAt) : "",
      status: debt.status,
      reported: debt.reported,
      payForDelete: debt.payForDelete,
      negotiable: debt.negotiable,
      reason: debt.reason,
      notes: debt.notes,
    });
    setIsFormOpen(true);
  }

  function openAddForm() {
    setError("");
    setForm({ ...emptyForm, trackedDate: toDateInput(new Date().toISOString()) });
    setIsFormOpen(true);
  }

  function closeForm() {
    setError("");
    setForm(emptyForm);
    setIsFormOpen(false);
  }

  async function importKnownDebts() {
    setImportError("");
    setIsImporting(true);

    try {
      await onImportKnownDebts();
      setCurrentPage(1);
    } catch (caught) {
      setImportError(caught instanceof Error ? caught.message : "Could not import debts.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="page-stack debts-page">
      <section className="summary-strip">
        <article>
          <span>Total balance</span>
          <strong>{formatCurrency(totals.balance)}</strong>
        </article>
        <article>
          <span>Current obligations</span>
          <strong>{formatCurrency(totals.currentPayoff)}</strong>
        </article>
        <article>
          <span>Potential savings</span>
          <strong>{formatCurrency(totals.savings)}</strong>
        </article>
      </section>

      <section className="debt-workspace">
        <section className="panel debt-queue-panel">
          <div className="debt-toolbar">
            <div>
              <h2>Debt list</h2>
              <p>
                {filteredDebts.length} shown of {debts.length} debts. Reported: {totals.reported}/{debts.length}.
              </p>
            </div>
            <div className="debt-list-actions">
              <button
                className="icon-text-button compact debt-sync-button"
                disabled={isImporting}
                type="button"
                onClick={() => void importKnownDebts()}
              >
                <FileUp size={17} />
                {isImporting ? "Syncing" : debts.length ? "Sync" : "Import"}
              </button>
              <button className="primary-button compact debt-add-button debt-entry" type="button" onClick={openAddForm}>
                <Plus size={17} />
                Add debt
              </button>
            </div>
          </div>

          <div className="debt-controls">
            <label className="debt-search-control">
              <Search size={16} />
              <input
                placeholder="Search creditors, reasons, notes"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="debt-select-control">
              <SlidersHorizontal size={16} />
              <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value as "ALL" | DebtPriorityLevel)}>
                <option value="ALL">All levels</option>
                {priorityLevelRanges.map((range) => (
                  <option key={range.level} value={range.level}>
                    {range.level}
                  </option>
                ))}
              </select>
            </label>
            <label className="debt-select-control">
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "ALL" | DebtStatus)}>
                <option value="ALL">All statuses</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="debt-select-control">
              <select value={reportedFilter} onChange={(event) => setReportedFilter(event.target.value as ReportedFilter)}>
                <option value="ALL">All reporting</option>
                <option value="REPORTED">Reported</option>
                <option value="NOT_REPORTED">Not reported</option>
              </select>
            </label>
            <label className="debt-select-control">
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as DebtSortMode)}>
                <option value="priority">Priority order</option>
                <option value="balance-desc">Largest balance</option>
                <option value="balance-asc">Smallest balance</option>
                <option value="creditor">Creditor name</option>
                <option value="tracked-desc">Newest tracked</option>
                <option value="target-asc">Target date</option>
              </select>
            </label>
          </div>

          {importError && <div className="form-error">{importError}</div>}

          {filteredDebts.length ? (
            <>
              <div className="debt-group-list">
                {visibleLevelGroups.map((group) => (
                  <section className={`debt-group-section group-${group.level.toLowerCase()}`} key={group.level}>
                    <header className="debt-group-header">
                      <div>
                        <span>{group.level}</span>
                        <strong>{formatCurrency(group.debts.reduce((sum, debt) => sum + getCurrentPayoffCents(debt, paymentSummary, negotiationInsights.get(debt.id)), 0))}</strong>
                      </div>
                      <em>{group.debts.length} debt{group.debts.length === 1 ? "" : "s"}</em>
                    </header>

                    <div className="debt-lines">
                      {group.debts.map((debt) => {
                        const insight = negotiationInsights.get(debt.id);
                        const figures = getDebtFigures(debt, paymentSummary, insight);
                        const noteText = getDebtExplanation(debt, figures, insight);

                        return (
                          <article className="debt-line" key={debt.id}>
                            <div className="debt-line-priority">
                              <span className="priority-pill">{debt.priority}</span>
                            </div>

                            <div className="debt-line-name">
                              <button className="debt-name-button" type="button" onClick={() => onOpenDebt(debt.id)}>
                                {debt.creditorName}
                              </button>
                              <span className="debt-category">{categoryLabels[debt.category]}</span>
                              <span className="note-tooltip" data-tooltip={noteText} tabIndex={0}>
                                <Info size={14} />
                              </span>
                            </div>

                            <div className="debt-line-money">
                              <span>Balance</span>
                              <strong>{formatCurrency(debt.balanceCents)}</strong>
                            </div>

                            <div className="debt-line-money muted-money">
                              <span>{figures.targetLabel}</span>
                              <strong>{formatCurrency(figures.payoffCents)}</strong>
                            </div>

                            <div className="debt-line-money">
                              <span>Remaining</span>
                              <strong>{formatCurrency(figures.remainingCents)}</strong>
                            </div>

                            <div className="debt-line-status">
                              <span className="status-pill">{statusLabels[debt.status]}</span>
                              <span className={`reported-pill ${debt.reported ? "reported-yes" : "reported-no"}`}>
                                {debt.reported ? "Reported" : "Not reported"}
                              </span>
                              {insight?.payForDeleteIncluded && <span className="reported-pill reported-yes">Pay-for-delete</span>}
                            </div>

                            <div className="table-actions">
                              <button className="icon-button" type="button" onClick={() => editDebt(debt)} aria-label={`Edit ${debt.creditorName}`}>
                                <Edit3 size={15} />
                              </button>
                              <button className="icon-button bad-entry" type="button" onClick={() => void onDelete(debt.id)} aria-label={`Delete ${debt.creditorName}`}>
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>

              <div className="pagination-bar">
                <span>
                  Showing {pageStart}-{pageEnd} of {filteredDebts.length}
                </span>
                <div>
                  <button className="icon-text-button compact" disabled={currentPage === 1} type="button" onClick={() => setCurrentPage((page) => page - 1)}>
                    Previous
                  </button>
                  <strong>
                    Page {currentPage} of {totalPages}
                  </strong>
                  <button className="icon-text-button compact" disabled={currentPage === totalPages} type="button" onClick={() => setCurrentPage((page) => page + 1)}>
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state debt-empty-state">
              <strong>{debts.length ? "No debts match those filters." : "Start with one debt."}</strong>
              <span>{debts.length ? "Adjust the search or filters to bring debts back into view." : "Add the creditor, balance, and why it matters. Your payoff plan will grow from that first clear entry."}</span>
            </div>
          )}
        </section>
      </section>

      {isFormOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel debt-modal-panel" role="dialog" aria-modal="true" aria-labelledby="debt-form-title">
            <header className="modal-header">
              <div>
                <p>Debt details</p>
                <h2 id="debt-form-title">{form.id ? "Edit debt" : "Add debt"}</h2>
              </div>
              <button className="icon-button" type="button" onClick={closeForm} aria-label="Close debt form">
                <X size={17} />
              </button>
            </header>

            <form className="debt-form" onSubmit={submit}>
              <div className="form-grid two">
                <label className="field-block">
                  Creditor
                  <input value={form.creditorName} onChange={(event) => setForm({ ...form, creditorName: event.target.value })} />
                </label>
                <label className="field-block">
                  Category
                  <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as DebtCategory })}>
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="form-grid two">
                <label className="field-block">
                  Priority
                  <input min={1} type="number" value={form.priority} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })} />
                </label>
                <label className="field-block">
                  Priority level
                  <select
                    value={getDebtPriorityLevel(form.priorityScore)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        priorityScore: priorityScoreByLevel[event.target.value as DebtPriorityLevel],
                      })
                    }
                  >
                    {priorityLevelRanges.map((range) => (
                      <option key={range.level} value={range.level}>
                        {range.level}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  Status
                  <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as DebtStatus })}>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  Months behind
                  <input inputMode="numeric" value={form.monthsBehind} onChange={(event) => setForm({ ...form, monthsBehind: event.target.value })} />
                </label>
              </div>

              <div className="form-grid two">
                <label className="field-block">
                  Balance
                  <input inputMode="decimal" value={form.balance} onChange={(event) => setForm({ ...form, balance: event.target.value })} />
                </label>
                <label className="field-block">
                  Settlement
                  <input inputMode="decimal" value={form.settlement} onChange={(event) => setForm({ ...form, settlement: event.target.value })} />
                </label>
                <label className="field-block">
                  Past due
                  <input inputMode="decimal" value={form.pastDue} onChange={(event) => setForm({ ...form, pastDue: event.target.value })} />
                </label>
                <label className="field-block">
                  APR
                  <input inputMode="decimal" value={form.apr} onChange={(event) => setForm({ ...form, apr: event.target.value })} />
                </label>
                <label className="field-block">
                  Minimum payment
                  <input inputMode="decimal" value={form.minimumPayment} onChange={(event) => setForm({ ...form, minimumPayment: event.target.value })} />
                </label>
              </div>

              <div className="form-grid two">
                <label className="field-block">
                  Tracked date
                  <input type="date" value={form.trackedDate} onChange={(event) => setForm({ ...form, trackedDate: event.target.value })} />
                </label>
                <label className="field-block">
                  Target date
                  <input type="date" value={form.targetDate} onChange={(event) => setForm({ ...form, targetDate: event.target.value })} />
                </label>
                <label className="field-block">
                  Settlement expires
                  <input type="date" value={form.settlementExpiresDate} onChange={(event) => setForm({ ...form, settlementExpiresDate: event.target.value })} />
                </label>
              </div>

              <div className="debt-check-grid">
                <label className="checkbox-row">
                  <input checked={form.reported} type="checkbox" onChange={(event) => setForm({ ...form, reported: event.target.checked })} />
                  Reported on credit
                </label>
                <label className="checkbox-row">
                  <input checked={form.payForDelete} type="checkbox" onChange={(event) => setForm({ ...form, payForDelete: event.target.checked })} />
                  Pay-for-delete
                </label>
                <label className="checkbox-row">
                  <input checked={form.negotiable} type="checkbox" onChange={(event) => setForm({ ...form, negotiable: event.target.checked })} />
                  Negotiable
                </label>
              </div>

              <label className="field-block">
                Reason
                <input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
              </label>

              <label className="field-block">
                Notes
                <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </label>

              {error && <div className="form-error">{error}</div>}

              <div className="form-actions">
                <button className="icon-text-button" type="button" onClick={closeForm}>
                  Cancel
                </button>
                <button className="primary-button debt-entry" disabled={isSaving} type="submit">
                  <Save size={17} />
                  {isSaving ? "Saving..." : form.id ? "Save changes" : "Add debt"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function getDebtFigures(debt: Debt, summary: ReturnType<typeof summarizePayments>, insight?: DebtNegotiationInsight) {
  const paidCents = summary.paidByDebt.get(debt.id) ?? 0;
  const remainingCents = getDebtRemainingCents(debt, summary);
  const obligation = getDebtPlanningTarget(debt, summary, insight);
  const targetSavingsCents = getDebtSettlementSavingsCents(debt, insight);

  return { paidCents, payoffCents: obligation.cents, remainingCents, savingsCents: targetSavingsCents, targetLabel: obligation.label, targetSource: obligation.source };
}

function getCurrentPayoffCents(debt: Debt, summary: ReturnType<typeof summarizePayments>, insight?: DebtNegotiationInsight) {
  return getDebtFigures(debt, summary, insight).payoffCents;
}

function compareDebts(a: Debt, b: Debt, sortMode: DebtSortMode, summary: ReturnType<typeof summarizePayments>, insights: Map<string, DebtNegotiationInsight>) {
  if (sortMode === "creditor") return a.creditorName.localeCompare(b.creditorName);
  if (sortMode === "balance-desc") return b.balanceCents - a.balanceCents;
  if (sortMode === "balance-asc") return a.balanceCents - b.balanceCents;
  if (sortMode === "tracked-desc") return b.trackedAt.localeCompare(a.trackedAt);
  if (sortMode === "target-asc") {
    const aDate = a.targetDate ?? "9999-12-31";
    const bDate = b.targetDate ?? "9999-12-31";
    return aDate.localeCompare(bDate) || a.priority - b.priority;
  }
  return getCurrentPayoffCents(b, summary, insights.get(b.id)) - getCurrentPayoffCents(a, summary, insights.get(a.id));
}

function getDebtExplanation(debt: Debt, figures: ReturnType<typeof getDebtFigures>, insight?: DebtNegotiationInsight) {
  const details = [
    debt.reason,
    debt.notes,
    figures.targetSource === "negotiation" ? `Accepted agreement ${formatCurrency(figures.payoffCents)}` : "",
    insight?.agreementDueAt ? `Agreement due ${formatLongDate(insight.agreementDueAt)}` : "",
    insight?.offerExpiresAt ? `Offer expires ${formatLongDate(insight.offerExpiresAt)}` : "",
    `Tracked ${formatLongDate(debt.trackedAt)}`,
    debt.targetDate ? `Target ${formatLongDate(debt.targetDate)}` : "",
    debt.settlementExpiresAt ? `Settlement expires ${formatLongDate(debt.settlementExpiresAt)}` : "",
    debt.pastDueCents !== null ? `Past due ${formatCurrency(debt.pastDueCents)}` : "",
    debt.aprBasisPoints !== null ? `APR ${(debt.aprBasisPoints / 100).toFixed(2)}%` : "",
    debt.minimumPaymentCents !== null ? `Minimum ${formatCurrency(debt.minimumPaymentCents)}` : "",
    debt.monthsBehind !== null ? `${debt.monthsBehind} month${debt.monthsBehind === 1 ? "" : "s"} behind` : "",
    debt.payForDelete || insight?.payForDeleteIncluded ? "Pay-for-delete target" : "",
    debt.negotiable ? "Negotiable" : "Not marked negotiable",
    figures.savingsCents ? `Potential savings ${formatCurrency(figures.savingsCents)}` : "",
    figures.paidCents ? `Paid so far ${formatCurrency(figures.paidCents)}` : "",
  ].filter(Boolean);

  return details.length ? details.join(" | ") : "No extra notes yet.";
}

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function toDateInput(value: string) {
  return value ? value.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}
