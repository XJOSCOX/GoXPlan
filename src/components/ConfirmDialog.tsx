import { AlertTriangle, X } from "lucide-react";

type ConfirmDialogProps = {
  confirmLabel?: string;
  isBusy?: boolean;
  message: string;
  title: string;
  tone?: "danger" | "neutral";
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  confirmLabel = "Confirm",
  isBusy = false,
  message,
  title,
  tone = "danger",
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <div className="modal-backdrop confirm-backdrop" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <header className="confirm-dialog-header">
          <div className={`confirm-dialog-icon ${tone}`}>
            <AlertTriangle size={21} />
          </div>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="Close confirmation" disabled={isBusy}>
            <X size={17} />
          </button>
        </header>

        <div className="confirm-dialog-copy">
          <h2 id="confirm-dialog-title">{title}</h2>
          <p>{message}</p>
        </div>

        <div className="confirm-dialog-actions">
          <button className="icon-text-button" type="button" onClick={onCancel} disabled={isBusy}>
            Cancel
          </button>
          <button className={`confirm-action ${tone}`} type="button" onClick={onConfirm} disabled={isBusy}>
            {isBusy ? "Working..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
