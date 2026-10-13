import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { contentWidthClassName, PageHeader } from '@/components/ui/page-header';
import { apiBase } from '@/lib/apollo';
import { useConfirm } from '@/lib/confirm';
import { useEnterprise } from '@/lib/enterprise';
import { toast } from '@/lib/toast';

// Both validation layers answer with `issues`: the schema with zod issues
// (path + message), the model rules with table + id + message. Flatten to one
// line each so a rejected import says what is wrong, not only that it is.
class ImportError extends Error {
  issues: string[];
  constructor(message: string, issues: string[]) {
    super(message);
    this.issues = issues;
  }
}

type RawIssue = { path?: unknown[]; table?: string; id?: string; message?: string };

function describeIssue(issue: RawIssue): string {
  const where = issue.table
    ? `${issue.table}${issue.id ? ` ${issue.id}` : ''}`
    : Array.isArray(issue.path)
      ? issue.path.join('.')
      : '';
  return where ? `${where}: ${issue.message ?? 'invalid'}` : (issue.message ?? 'invalid');
}

// The File System Access API (Chromium) shows a save dialog and tells us
// whether the person went through with it. Not in TypeScript's DOM lib yet.
type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable(): Promise<WritableStream> }>;

// Resolves to true when the file was saved, false when the person cancelled.
// Browsers without the picker get a plain download, which cannot be cancelled
// from script and gives its own feedback, so that path reports nothing.
async function saveBundle(blob: Blob, fileName: string): Promise<boolean | null> {
  const picker = (window as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [{ description: 'OpenEAM bundle', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await blob.stream().pipeTo(writable);
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return false;
      throw err;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  return null;
}

async function exportBundle(enterpriseId: string, enterpriseName: string) {
  const res = await fetch(
    `${apiBase}/api/data-exchange/export?enterpriseId=${encodeURIComponent(enterpriseId)}`,
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const slug = enterpriseName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const saved = await saveBundle(
    blob,
    `openeam-${slug}-${new Date().toISOString().slice(0, 10)}.json`,
  );
  if (saved) toast.success(`Exported "${enterpriseName}".`);
}

async function uploadImport(file: File) {
  const text = await file.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  const res = await fetch(`${apiBase}/api/data-exchange/import`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const issues: RawIssue[] = Array.isArray(payload?.issues) ? payload.issues : [];
    throw new ImportError(
      payload?.message ?? `Import failed (${res.status})`,
      issues.map(describeIssue),
    );
  }
}

function DataExchangeRoute() {
  const { enterprise, can } = useEnterprise();
  const canExport = can('data.export');
  const canImport = can('data.import');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // A rejected bundle's problems, listed under the import card: too many
  // lines for a toast, and worth keeping on screen while fixing the file.
  const [rejected, setRejected] = useState<{ message: string; issues: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const handleExport = async () => {
    if (!enterprise) return;
    setBusy(true);
    try {
      await exportBundle(enterprise.id, enterprise.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const confirmed = await confirm({
      title: 'Replace the enterprises in this bundle?',
      description:
        'Everything modelled in them — value streams, capabilities, processes, actors, information and building blocks — is replaced by the bundle. Other enterprises are not touched.',
      confirmLabel: 'Import',
      destructive: true,
    });
    if (!confirmed) return;

    setBusy(true);
    setRejected(null);
    try {
      await uploadImport(file);
      toast.success('Import complete. Reload the pages you have open to see the new data.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed.';
      toast.error(message);
      if (err instanceof ImportError && err.issues.length > 0) {
        setRejected({ message, issues: err.issues });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={contentWidthClassName}>
      <PageHeader title="Export & Import" />
      <p className="mb-6 text-sm text-muted-foreground">
        A bundle is a snapshot of an enterprise's whole model as one JSON file: for backups, for
        moving an enterprise to another OpenEAM instance, and for keeping a copy under version
        control. Import replaces the bundle's enterprises and leaves all others untouched. Bundles
        from older versions of OpenEAM are upgraded on import; it is not a way to merge changes or
        to load data from other tools.
      </p>

      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">Export</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Download {enterprise ? `"${enterprise.name}"` : 'the current enterprise'} as JSON.
            {enterprise && !canExport && ' Only members of the enterprise can export it.'}
          </p>
          <Button
            className="mt-3"
            onClick={handleExport}
            disabled={busy || !enterprise || !canExport}
          >
            Export JSON
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">Import</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Upload a JSON bundle. It replaces the enterprises it contains.
            {!canImport && ' Only an owner of the enterprise can do this.'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleFileSelected}
          />
          <Button
            className="mt-3"
            variant="destructive"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy || !canImport}
          >
            Import JSON
          </Button>
        </div>

        {rejected && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm">
            <p className="font-semibold text-destructive">{rejected.message}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nothing was written. Fix the bundle and import it again.
            </p>
            <ul className="mt-3 max-h-64 list-disc space-y-0.5 overflow-auto pl-5 font-mono text-xs text-foreground">
              {rejected.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute('/data-exchange/')({
  component: DataExchangeRoute,
});
