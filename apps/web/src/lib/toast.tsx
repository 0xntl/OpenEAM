// Toasts: short confirmations and errors, bottom right, gone on their own.
// `toast.success("Saved")` from anywhere — a component, a handler, the
// Apollo link — and the provider renders the stack. Errors stay a little
// longer and can always be dismissed by hand.
import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type Tone = 'success' | 'error';

interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

const listeners = new Set<(item: Omit<ToastItem, 'id'>) => void>();

function emit(tone: Tone, message: string) {
  for (const listener of listeners) listener({ tone, message });
}

// Usable outside React (e.g. lib/apollo.ts).
export const toast = {
  success: (message: string) => emit('success', message),
  error: (message: string) => emit('error', message),
};

const ToastContext = createContext<typeof toast | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    let next = 1;
    const listener = (item: Omit<ToastItem, 'id'>) => {
      const id = next++;
      setItems((list) => [...list, { ...item, id }]);
      window.setTimeout(
        () => setItems((list) => list.filter((t) => t.id !== id)),
        item.tone === 'error' ? 8000 : 3500,
      );
    };
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);

  const dismiss = useCallback(
    (id: number) => setItems((list) => list.filter((t) => t.id !== id)),
    [],
  );
  const value = useMemo(() => toast, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-lg shadow-black/10 backdrop-blur-md animate-in slide-in-from-bottom-2 fade-in duration-200 ${
              item.tone === 'error'
                ? 'border-destructive/40 bg-background/95 text-destructive'
                : 'border-border bg-background/95 text-foreground'
            }`}
          >
            {item.tone === 'error' ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            )}
            <span className="min-w-0 flex-1">{item.message}</span>
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
              onClick={() => dismiss(item.id)}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
