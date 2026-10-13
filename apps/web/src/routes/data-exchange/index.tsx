import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { contentWidthClassName, PageHeader } from '@/components/ui/page-header';
import { apiBase } from '@/lib/apollo';
import { useConfirm } from '@/lib/confirm';
import { useEnterprise } from '@/lib/enterprise';
import { toast } from '@/lib/toast';

type Status =
  | { kind: 'idle' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

async function downloadExport(enterpriseId: string, enterpriseName: string) {
  const res = await fetch(
    `${apiBase}/api/data-exchange/export?enterpriseId=${encodeURIComponent(enterpriseId)}`,
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = enterpriseName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  a.href = url;
  a.download = `openeam-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function uploadImport(file: File) {
  const text = await file.text();
  const body = JSON.parse(text);
  const res = await fetch(`${apiBase}/api/data-exchange/import`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.message ?? `Import failed (${res.status})`);
  }
}

function DataExchangeRoute() {
  const { enterprise, can } = useEnterprise();
  const canExport = can('data.export');
  const canImport = can('data.import');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const handleExport = async () => {
    if (!enterprise) return;
    setBusy(true);
    setStatus({ kind: 'idle' });
    try {
      await downloadExport(enterprise.id, enterprise.name);
      setStatus({ kind: 'success', message: `Exported "${enterprise.name}".` });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Export failed.' });
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
    setStatus({ kind: 'idle' });
    try {
      await uploadImport(file);
      toast.success('Import complete.');
      setStatus({
        kind: 'success',
        message: 'Import complete. Reload the relevant pages to see the new data.',
      });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Import failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={contentWidthClassName}>
      <PageHeader title="Data Exchange" />
      <p className="mb-6 text-sm text-muted-foreground">
        Export the current enterprise's model as a single JSON bundle, or import a bundle to restore
        or move enterprises between OpenEAM instances. Import replaces the bundle's enterprises and
        leaves all others untouched.
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

        {status.kind !== 'idle' && (
          <p
            className={`text-sm ${status.kind === 'error' ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}
          >
            {status.message}
          </p>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute('/data-exchange/')({
  component: DataExchangeRoute,
});
