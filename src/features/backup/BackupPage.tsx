import { DatabaseBackup, Download, FileJson, FileSpreadsheet, Merge, Replace, Upload } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getBackupPreview, type BackupImportMode, type BackupImportSummary, type BackupPreview, type GoXPlanBackup } from "../../db/localDatabase";
import type { Debt } from "../../types";

type BackupPageProps = {
  counts: {
    accounts: number;
    debts: number;
    income: number;
    negotiations: number;
    payments: number;
  };
  debts: Debt[];
  onExportBackup: () => Promise<GoXPlanBackup>;
  onImportBackup: (backup: unknown, mode: BackupImportMode) => Promise<BackupImportSummary>;
};

export function BackupPage({ counts, debts, onExportBackup, onImportBackup }: BackupPageProps) {
  const [error, setError] = useState("");
  const [importMode, setImportMode] = useState<BackupImportMode>("MERGE");
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<unknown>();
  const [selectedFile, setSelectedFile] = useState<File>();
  const [selectedPreview, setSelectedPreview] = useState<BackupPreview>();
  const [success, setSuccess] = useState("");
  const [pendingReplaceBackup, setPendingReplaceBackup] = useState<unknown>();

  async function exportBackup() {
    setError("");
    setSuccess("");
    setIsExporting(true);

    try {
      const backup = await onExportBackup();
      downloadText(`goxplan-backup-${fileDate()}.json`, JSON.stringify(backup, null, 2), "application/json");
      setSuccess("Backup exported.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not export backup.");
    } finally {
      setIsExporting(false);
    }
  }

  function exportDebtsCsv() {
    setError("");
    setSuccess("");
    downloadText(`goxplan-debts-${fileDate()}.csv`, debtsToCsv(debts), "text/csv;charset=utf-8");
    setSuccess("Debt CSV exported.");
  }

  async function chooseBackupFile(file: File | undefined) {
    setError("");
    setSuccess("");
    setSelectedBackup(undefined);
    setSelectedFile(undefined);
    setSelectedPreview(undefined);

    if (!file) return;

    try {
      const backup = JSON.parse(await file.text()) as unknown;
      const preview = getBackupPreview(backup);
      setSelectedBackup(backup);
      setSelectedFile(file);
      setSelectedPreview(preview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that backup file.");
    }
  }

  async function startImport() {
    setError("");
    setSuccess("");

    if (!selectedBackup) {
      setError("Choose a GoXPlan backup file first.");
      return;
    }

    if (importMode === "REPLACE") {
      setPendingReplaceBackup(selectedBackup);
      return;
    }

    await runImport(selectedBackup, "MERGE");
  }

  async function runImport(backup: unknown, mode: BackupImportMode) {
    setError("");
    setSuccess("");
    setIsImporting(true);

    try {
      if (mode === "REPLACE") {
        const safetySnapshot = await onExportBackup();
        downloadText(`goxplan-safety-snapshot-${fileDateTime()}.json`, JSON.stringify(safetySnapshot, null, 2), "application/json");
      }

      const summary = await onImportBackup(backup, mode);
      setSelectedFile(undefined);
      setSelectedBackup(undefined);
      setSelectedPreview(undefined);
      setPendingReplaceBackup(undefined);
      setSuccess(formatImportSummary(summary, mode === "REPLACE"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import backup.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="page-stack backup-page">
      <section className="panel backup-hero">
        <div>
          <DatabaseBackup size={22} />
          <h2>Backup and restore</h2>
          <p>Keep a copy of your workspace, move it to another browser, or restore from a saved file.</p>
        </div>
        <div className="backup-summary-grid" aria-label="Workspace totals">
          <SummaryValue label="Debts" value={counts.debts} />
          <SummaryValue label="Accounts" value={counts.accounts} />
          <SummaryValue label="Income" value={counts.income} />
          <SummaryValue label="Negotiations" value={counts.negotiations} />
          <SummaryValue label="Payments" value={counts.payments} />
        </div>
      </section>

      <section className="backup-grid">
        <article className="panel backup-card">
          <div className="backup-card-heading">
            <FileJson size={19} />
            <div>
              <h2>Full backup</h2>
              <p>Exports debts, accounts, income, negotiations, payments, and payoff settings.</p>
            </div>
          </div>
          <button className="primary-button backup-wide-button" type="button" onClick={() => void exportBackup()} disabled={isExporting}>
            <Download size={17} />
            {isExporting ? "Exporting..." : "Export JSON backup"}
          </button>
        </article>

        <article className="panel backup-card">
          <div className="backup-card-heading">
            <FileSpreadsheet size={19} />
            <div>
              <h2>Debt spreadsheet</h2>
              <p>Exports the debt register as CSV for Excel or Google Sheets.</p>
            </div>
          </div>
          <button className="icon-text-button backup-wide-button" type="button" onClick={exportDebtsCsv} disabled={!debts.length}>
            <Download size={17} />
            Export debts CSV
          </button>
        </article>
      </section>

      <section className="panel backup-import-panel">
        <div className="backup-card-heading">
          <Upload size={19} />
          <div>
            <h2>Import backup</h2>
            <p>Merge into this workspace or replace the current saved records.</p>
          </div>
        </div>

        <label className="backup-dropzone">
          <input
            accept="application/json,.json"
            type="file"
            onChange={(event) => {
              void chooseBackupFile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <FileJson size={22} />
          <strong>{selectedFile?.name ?? "Choose a JSON backup"}</strong>
          <span>{selectedFile ? `${formatBytes(selectedFile.size)} ready to import` : "Drop a backup here or browse your files."}</span>
        </label>

        {selectedPreview && (
          <div className="backup-preview-card">
            <div>
              <span>Backup date</span>
              <strong>{formatDateTime(selectedPreview.exportedAt)}</strong>
            </div>
            <PreviewCount label="Debts" value={selectedPreview.counts.debts} />
            <PreviewCount label="Accounts" value={selectedPreview.counts.accounts} />
            <PreviewCount label="Income" value={selectedPreview.counts.income} />
            <PreviewCount label="Negotiations" value={selectedPreview.counts.negotiations} />
            <PreviewCount label="Payments" value={selectedPreview.counts.payments} />
            <PreviewCount label="Plan" value={selectedPreview.counts.payoffSettings} />
          </div>
        )}

        <div className="backup-mode-row" role="radiogroup" aria-label="Import mode">
          <button className={importMode === "MERGE" ? "active" : ""} type="button" onClick={() => setImportMode("MERGE")}>
            <Merge size={16} />
            Merge
          </button>
          <button className={importMode === "REPLACE" ? "active danger" : "danger"} type="button" onClick={() => setImportMode("REPLACE")}>
            <Replace size={16} />
            Replace
          </button>
        </div>

        {importMode === "REPLACE" && (
          <div className="backup-warning">
            Replace downloads a safety snapshot first, then removes the current saved records before restoring the backup.
          </div>
        )}

        {(error || success) && <div className={error ? "form-error" : "form-success"}>{error || success}</div>}

        <div className="form-actions">
          <button className="primary-button backup-import-button" type="button" onClick={() => void startImport()} disabled={isImporting || !selectedFile}>
            <Upload size={17} />
            {isImporting ? "Importing..." : importMode === "REPLACE" ? "Restore backup" : "Import backup"}
          </button>
        </div>
      </section>

      {pendingReplaceBackup !== undefined && (
        <ConfirmDialog
          confirmLabel="Replace data"
          isBusy={isImporting}
          message="This will remove your current saved records and restore the selected backup file. This cannot be undone unless you already exported a backup."
          title="Replace current data?"
          onCancel={() => setPendingReplaceBackup(undefined)}
          onConfirm={() => void runImport(pendingReplaceBackup, "REPLACE")}
        />
      )}
    </div>
  );
}

function SummaryValue({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PreviewCount({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function debtsToCsv(debts: Debt[]) {
  const headers = [
    "Priority",
    "Creditor",
    "Level",
    "Balance",
    "Settlement",
    "Past due",
    "Minimum payment",
    "Status",
    "Reported",
    "Reason",
    "Notes",
    "Tracked at",
  ];
  const rows = debts.map((debt) => [
    debt.priority,
    debt.creditorName,
    getLevel(debt.priorityScore),
    centsToDecimal(debt.balanceCents),
    debt.settlementCents === null ? "" : centsToDecimal(debt.settlementCents),
    debt.pastDueCents === null ? "" : centsToDecimal(debt.pastDueCents),
    debt.minimumPaymentCents === null ? "" : centsToDecimal(debt.minimumPaymentCents),
    debt.status,
    debt.reported ? "Yes" : "No",
    debt.reason,
    debt.notes,
    debt.trackedAt,
  ]);

  return [headers, ...rows].map((row) => row.map(toCsvCell).join(",")).join("\n");
}

function getLevel(score: number) {
  if (score >= 100) return "Emergency";
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Medium";
  return "Low";
}

function centsToDecimal(cents: number) {
  return (cents / 100).toFixed(2);
}

function toCsvCell(value: string | number) {
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function fileDate() {
  return new Date().toISOString().slice(0, 10);
}

function fileDateTime() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatImportSummary(summary: BackupImportSummary, safetySnapshotCreated: boolean) {
  const action = summary.mode === "REPLACE" ? "Backup restored" : "Backup merged";
  const counts = summary.counts;
  const details = `${counts.debts} debts, ${counts.accounts} accounts, ${counts.income} income records, ${counts.negotiations} negotiations, ${counts.payments} payments`;
  return safetySnapshotCreated ? `${action}. Safety snapshot downloaded. Imported ${details}.` : `${action}. Imported ${details}.`;
}
