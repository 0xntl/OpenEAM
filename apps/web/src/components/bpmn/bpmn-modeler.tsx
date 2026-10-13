// Full BPMN editor (palette, context pad, direct label editing). Loaded
// lazily — bpmn-js is a large dependency, so this module must only be
// imported via React.lazy (see the diagram edit route).
//
// The modeler's command stack is the source of truth while editing; React
// only tracks a dirty flag. XML is exported once, on save.
import Modeler from 'bpmn-js/lib/Modeler';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EMPTY_DIAGRAM } from './empty-diagram';

interface BpmnModelerProps {
  // Initial content only — later prop changes are intentionally ignored so
  // in-progress edits are never clobbered by a re-render.
  xml: string | null;
  onSave: (xml: string) => Promise<void>;
}

export default function BpmnModeler({ xml, onSave }: BpmnModelerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<Modeler | null>(null);
  const initialXmlRef = useRef(xml);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const modeler = new Modeler({ container });
    modelerRef.current = modeler;
    let destroyed = false;

    modeler
      .importXML(initialXmlRef.current ?? EMPTY_DIAGRAM)
      .then(() => {
        if (destroyed) return;
        const canvas = modeler.get('canvas') as { zoom: (mode: string) => void };
        canvas.zoom('fit-viewport');
      })
      .catch((err: unknown) => {
        if (destroyed) return;
        setError(err instanceof Error ? err.message : 'Failed to load diagram');
      });

    modeler.on('commandStack.changed', () => setDirty(true));

    // StrictMode double-invokes this effect in dev; without destroy() the
    // second modeler would stack a second palette into the container.
    return () => {
      destroyed = true;
      modeler.destroy();
      modelerRef.current = null;
    };
  }, []);

  const handleSave = useCallback(async () => {
    const modeler = modelerRef.current;
    if (!modeler) return;
    setSaving(true);
    setError(null);
    try {
      const { xml: exported } = await modeler.saveXML({ format: true });
      if (!exported) throw new Error('Exporting the diagram produced no XML');
      await onSave(exported);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving the diagram failed');
    } finally {
      setSaving(false);
    }
  }, [onSave]);

  return (
    <div className="relative h-full min-h-0">
      {/* Floating glass toolbar, top right — bpmn-js keeps its palette top
          left, so the two never collide. Same treatment as the landscape
          filter bar. */}
      <div className="pointer-events-none absolute top-3 right-3 z-10 flex justify-end">
        <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-border/70 bg-background/80 px-3 py-2 shadow-lg shadow-black/5 backdrop-blur-md dark:shadow-black/30">
          {error && <p className="text-xs text-destructive">{error}</p>}
          {dirty && !error && <p className="text-xs text-muted-foreground">Unsaved changes</p>}
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save diagram'}
          </Button>
        </div>
      </div>
      {/* bpmn-js draws dark strokes on a transparent canvas, so the editing
          surface stays light in both themes for readability. In dark mode we
          use a soft grey panel rather than pure white to avoid a glaring box
          in the dark UI. */}
      <div ref={containerRef} className="h-full w-full bg-white dark:bg-neutral-300" />
    </div>
  );
}
