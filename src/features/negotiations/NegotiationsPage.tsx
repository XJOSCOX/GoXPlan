import { ArrowRight, CalendarDays, Clock3, Edit3, Handshake, Plus, Save, Trash2, X } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type { Debt, Negotiation, NegotiationContactMethod, NegotiationInput, NegotiationStatus } from "../../types";

type NegotiationsPageProps = {
  debts: Debt[];
  negotiations: Negotiation[];
  onDelete: (negotiationId: string) => Promise<void>;
  onSave: (input: NegotiationInput) => Promise<void>;
  onUseForPayoff: (negotiation: Negotiation) => void;
};

const emptyForm: NegotiationInput = {
  debtId: "",
  contactDate: toDateInput(new Date().toISOString()),
  contactMethod: "PHONE",
  representative: "",
  phoneOrPortal: "",
  balance: "",
  currentOffer: "",
  userOffer: "",
  counterOffer: "",
  finalAgreement: "",
  numberOfPayments: "",
  dueDate: "",
  writtenAgreementReceived: false,
  payForDeleteIncluded: false,
  offerExpiresDate: "",
  followUpDate: "",
  status: "CONTACTED",
  notes: "",
};

const methodLabels: Record<NegotiationContactMethod, string> = {
  CHAT: "Chat",
  EMAIL: "Email",
  MAIL: "Mail",
  OTHER: "Other",
  PHONE: "Phone",
  PORTAL: "Portal",
};

const statusLabels: Record<NegotiationStatus, string> = {
  ACCEPTED: "Accepted",
  CLOSED: "Closed",
  CONTACTED: "Contacted",
  COUNTERED: "Countered",
  DECLINED: "Declined",
  FOLLOW_UP: "Follow-up",
  OFFER_SENT: "Offer sent",
  PLANNED: "Planned",
};

export function NegotiationsPage({ debts, negotiations, onDelete, onSave, onUseForPayoff }: NegotiationsPageProps) {
  const [error, setError] = useState("");
  const [form, setForm] = useState<NegotiationInput>({ ...emptyForm, debtId: debts[0]?.id ?? "" });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const totals = useMemo(() => {
    const accepted = negotiations.filter((item) => item.status === "ACCEPTED").length;
    const followUps = negotiations.filter((item) => item.followUpAt && !isPast(item.followUpAt)).length;
    const expiring = negotiations.filter((item) => item.offerExpiresAt && isWithinDays(item.offerExpiresAt, 14)).length;
    const finalAgreements = negotiations.reduce((sum, item) => sum + (item.finalAgreementCents ?? 0), 0);
    return {
      accepted,
      expiring,
      finalAgreements,
      followUps,
      total: negotiations.length,
    };
  }, [negotiations]);

  const selectedDebt = debts.find((debt) => debt.id === form.debtId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);

    try {
      await onSave(form);
      closeForm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save negotiation.");
    } finally {
      setIsSaving(false);
    }
  }

  function openAddForm() {
    setError("");
    setForm({ ...emptyForm, debtId: debts[0]?.id ?? "" });
    setIsFormOpen(true);
  }

  function editNegotiation(negotiation: Negotiation) {
    setError("");
    setForm({
      id: negotiation.id,
      balance: centsToInput(negotiation.balanceCents),
      contactDate: toDateInput(negotiation.contactDate),
      contactMethod: negotiation.contactMethod,
      counterOffer: centsToInput(negotiation.counterOfferCents),
      currentOffer: centsToInput(negotiation.currentOfferCents),
      debtId: negotiation.debtId ?? "",
      dueDate: toDateInput(negotiation.dueDate),
      finalAgreement: centsToInput(negotiation.finalAgreementCents),
      followUpDate: toDateInput(negotiation.followUpAt),
      notes: negotiation.notes,
      numberOfPayments: negotiation.numberOfPayments?.toString() ?? "",
      offerExpiresDate: toDateInput(negotiation.offerExpiresAt),
      payForDeleteIncluded: negotiation.payForDeleteIncluded,
      phoneOrPortal: negotiation.phoneOrPortal,
      representative: negotiation.representative,
      status: negotiation.status,
      userOffer: centsToInput(negotiation.userOfferCents),
      writtenAgreementReceived: negotiation.writtenAgreementReceived,
    });
    setIsFormOpen(true);
  }

  function closeForm() {
    setError("");
    setForm({ ...emptyForm, debtId: debts[0]?.id ?? "" });
    setIsFormOpen(false);
  }

  function setDebt(debtId: string) {
    const debt = debts.find((item) => item.id === debtId);
    setForm({
      ...form,
      balance: debt && !form.balance.trim() ? centsToInput(debt.balanceCents) : form.balance,
      currentOffer: debt?.settlementCents !== null && debt?.settlementCents !== undefined && !form.currentOffer.trim() ? centsToInput(debt.settlementCents) : form.currentOffer,
      debtId,
      payForDeleteIncluded: debt?.payForDelete ?? form.payForDeleteIncluded,
    });
  }

  return (
    <div className="page-stack negotiations-page">
      <section className="summary-strip negotiation-summary-strip">
        <article>
          <span>Negotiations</span>
          <strong>{totals.total}</strong>
        </article>
        <article>
          <span>Accepted</span>
          <strong>{totals.accepted}</strong>
        </article>
        <article>
          <span>Follow-ups</span>
          <strong>{totals.followUps}</strong>
        </article>
        <article>
          <span>Expiring offers</span>
          <strong>{totals.expiring}</strong>
        </article>
        <article>
          <span>Agreements</span>
          <strong>{formatCurrency(totals.finalAgreements)}</strong>
        </article>
      </section>

      <section className="panel negotiations-panel">
        <div className="income-toolbar">
          <div>
            <h2>Negotiations</h2>
            <p>{negotiations.length ? "Offers, follow-ups, and agreements by debt." : "Track the first creditor conversation."}</p>
          </div>
          <button className="primary-button compact negotiation-add-button" disabled={!debts.length} type="button" onClick={openAddForm}>
            <Plus size={17} />
            Add negotiation
          </button>
        </div>

        {negotiations.length ? (
          <div className="negotiation-lines">
            {negotiations.map((negotiation) => (
              <article className="negotiation-line" key={negotiation.id}>
                <div className="negotiation-main">
                  <Handshake size={17} />
                  <div>
                    <strong>{negotiation.debtName ?? "Removed debt"}</strong>
                    <span>
                      {methodLabels[negotiation.contactMethod]}
                      {negotiation.representative ? ` - ${negotiation.representative}` : ""}
                      {negotiation.phoneOrPortal ? ` - ${negotiation.phoneOrPortal}` : ""}
                    </span>
                  </div>
                </div>

                <div className="negotiation-offer">
                  <span>Latest offer</span>
                  <strong>{formatCurrency(getLatestOffer(negotiation))}</strong>
                </div>

                <div className="negotiation-date">
                  <CalendarDays size={15} />
                  <span>{formatDate(negotiation.contactDate)}</span>
                </div>

                <div className="negotiation-status">
                  <span className={`negotiation-pill ${negotiation.status.toLowerCase().replace("_", "-")}`}>
                    {statusLabels[negotiation.status]}
                  </span>
                  {negotiation.payForDeleteIncluded && <span>Pay-for-delete</span>}
                  {negotiation.writtenAgreementReceived && <span>Written agreement</span>}
                </div>

                <div className="negotiation-next">
                  <span>{negotiation.followUpAt ? "Follow-up" : negotiation.offerExpiresAt ? "Expires" : "Next step"}</span>
                  <strong>{formatNextDate(negotiation.followUpAt ?? negotiation.offerExpiresAt)}</strong>
                </div>

                <div className="table-actions">
                  {canUseForPayoff(negotiation) && (
                    <button className="icon-button good-entry" type="button" onClick={() => onUseForPayoff(negotiation)} aria-label={`Use agreement for ${negotiation.debtName ?? "debt"} payoff`}>
                      <ArrowRight size={15} />
                    </button>
                  )}
                  <button className="icon-button" type="button" onClick={() => editNegotiation(negotiation)} aria-label={`Edit negotiation for ${negotiation.debtName ?? "debt"}`}>
                    <Edit3 size={15} />
                  </button>
                  <button className="icon-button bad-entry" type="button" onClick={() => void onDelete(negotiation.id)} aria-label={`Delete negotiation for ${negotiation.debtName ?? "debt"}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state negotiations-empty-state">
            <strong>{debts.length ? "No negotiations recorded yet." : "Add a debt before recording negotiations."}</strong>
            <span>Use this to remember offers, written agreements, pay-for-delete promises, and follow-up dates.</span>
          </div>
        )}
      </section>

      {isFormOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel negotiation-modal-panel" role="dialog" aria-modal="true" aria-labelledby="negotiation-form-title">
            <header className="modal-header">
              <div>
                <p>Negotiation details</p>
                <h2 id="negotiation-form-title">{form.id ? "Edit negotiation" : "Add negotiation"}</h2>
              </div>
              <button className="icon-button" type="button" onClick={closeForm} aria-label="Close negotiation form">
                <X size={17} />
              </button>
            </header>

            <form className="debt-form" onSubmit={submit}>
              <div className="form-grid two">
                <label className="field-block">
                  Debt
                  <select value={form.debtId} onChange={(event) => setDebt(event.target.value)}>
                    <option value="">Choose a debt</option>
                    {debts.map((debt) => (
                      <option key={debt.id} value={debt.id}>
                        {debt.creditorName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  Status
                  <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as NegotiationStatus })}>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  Contact date
                  <input type="date" value={form.contactDate} onChange={(event) => setForm({ ...form, contactDate: event.target.value })} />
                </label>
                <label className="field-block">
                  Contact method
                  <select value={form.contactMethod} onChange={(event) => setForm({ ...form, contactMethod: event.target.value as NegotiationContactMethod })}>
                    {Object.entries(methodLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  Representative
                  <input value={form.representative} onChange={(event) => setForm({ ...form, representative: event.target.value })} />
                </label>
                <label className="field-block">
                  Phone or portal
                  <input value={form.phoneOrPortal} onChange={(event) => setForm({ ...form, phoneOrPortal: event.target.value })} />
                </label>
              </div>

              {selectedDebt && (
                <div className="negotiation-context">
                  <span>Selected debt</span>
                  <strong>{selectedDebt.creditorName}</strong>
                  <em>{formatCurrency(selectedDebt.balanceCents)} balance</em>
                </div>
              )}

              <div className="form-grid two">
                <label className="field-block">
                  Balance discussed
                  <input inputMode="decimal" value={form.balance} onChange={(event) => setForm({ ...form, balance: event.target.value })} />
                </label>
                <label className="field-block">
                  Current offer
                  <input inputMode="decimal" value={form.currentOffer} onChange={(event) => setForm({ ...form, currentOffer: event.target.value })} />
                </label>
                <label className="field-block">
                  Your offer
                  <input inputMode="decimal" value={form.userOffer} onChange={(event) => setForm({ ...form, userOffer: event.target.value })} />
                </label>
                <label className="field-block">
                  Counteroffer
                  <input inputMode="decimal" value={form.counterOffer} onChange={(event) => setForm({ ...form, counterOffer: event.target.value })} />
                </label>
                <label className="field-block">
                  Final agreement
                  <input inputMode="decimal" value={form.finalAgreement} onChange={(event) => setForm({ ...form, finalAgreement: event.target.value })} />
                </label>
                <label className="field-block">
                  Number of payments
                  <input inputMode="numeric" min={1} type="number" value={form.numberOfPayments} onChange={(event) => setForm({ ...form, numberOfPayments: event.target.value })} />
                </label>
                <label className="field-block">
                  First due date
                  <input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
                </label>
                <label className="field-block">
                  Offer expiration
                  <input type="date" value={form.offerExpiresDate} onChange={(event) => setForm({ ...form, offerExpiresDate: event.target.value })} />
                </label>
                <label className="field-block">
                  Follow-up date
                  <input type="date" value={form.followUpDate} onChange={(event) => setForm({ ...form, followUpDate: event.target.value })} />
                </label>
              </div>

              <div className="negotiation-checks">
                <label className="checkbox-row">
                  <input checked={form.writtenAgreementReceived} type="checkbox" onChange={(event) => setForm({ ...form, writtenAgreementReceived: event.target.checked })} />
                  Written agreement received
                </label>
                <label className="checkbox-row">
                  <input checked={form.payForDeleteIncluded} type="checkbox" onChange={(event) => setForm({ ...form, payForDeleteIncluded: event.target.checked })} />
                  Pay-for-delete included
                </label>
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
                <button className="primary-button negotiation-add-button" disabled={isSaving} type="submit">
                  <Save size={17} />
                  {isSaving ? "Saving..." : form.id ? "Save changes" : "Add negotiation"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function getLatestOffer(negotiation: Negotiation) {
  return negotiation.finalAgreementCents ?? negotiation.counterOfferCents ?? negotiation.userOfferCents ?? negotiation.currentOfferCents ?? 0;
}

function canUseForPayoff(negotiation: Negotiation) {
  return Boolean(negotiation.debtId && negotiation.status === "ACCEPTED" && negotiation.finalAgreementCents !== null && negotiation.finalAgreementCents > 0);
}

function centsToInput(cents: number | null) {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function isPast(value: string) {
  return new Date(`${value.slice(0, 10)}T23:59:59`).getTime() < Date.now();
}

function isWithinDays(value: string, days: number) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  const difference = time - Date.now();
  return difference >= 0 && difference <= days * 24 * 60 * 60 * 1000;
}

function formatNextDate(value: string | null) {
  if (!value) return "-";
  return (
    <>
      <Clock3 size={14} />
      {formatDate(value)}
    </>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}
