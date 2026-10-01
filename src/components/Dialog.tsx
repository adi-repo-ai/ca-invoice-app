import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './ui';

// In-app confirm / prompt dialogs (replace the browser's plain pop-ups).

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}
interface PromptOptions extends ConfirmOptions {
  label?: string;
  defaultValue?: string;
  inputType?: string;
  minLength?: number;
}
interface DialogApi {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  prompt: (o: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi>({
  confirm: async () => false,
  prompt: async () => null,
});

type Pending =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void };

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ kind: 'confirm', opts, resolve })), []);
  const prompt = useCallback((opts: PromptOptions) => new Promise<string | null>((resolve) => setPending({ kind: 'prompt', opts, resolve })), []);
  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {pending && <DialogView pending={pending} close={() => setPending(null)} />}
    </DialogContext.Provider>
  );
}

export const useDialog = () => useContext(DialogContext);

function DialogView({ pending, close }: { pending: Pending; close: () => void }) {
  const { opts } = pending;
  const [value, setValue] = useState(pending.kind === 'prompt' ? (pending.opts.defaultValue ?? '') : '');
  const okRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const finish = useCallback(
    (ok: boolean) => {
      if (pending.kind === 'confirm') pending.resolve(ok);
      else pending.resolve(ok ? value : null);
      close();
    },
    [pending, value, close],
  );

  useEffect(() => {
    (inputRef.current ?? okRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [finish]);

  const promptOpts = pending.kind === 'prompt' ? pending.opts : null;
  const invalid = promptOpts?.minLength ? value.length < promptOpts.minLength : false;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/50 backdrop-blur-sm" onClick={() => finish(false)} />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) finish(true);
        }}
        className="relative w-full max-w-md animate-fade-in rounded-2xl border border-slate-200 bg-surface p-6 shadow-2xl"
      >
        <div className="flex gap-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${opts.danger ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-800'}`} aria-hidden="true">
            {opts.danger ? '!' : '?'}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="dialog-title" className="text-base font-semibold text-slate-900">
              {opts.title}
            </h2>
            {opts.message && <div className="mt-1.5 text-sm text-slate-600">{opts.message}</div>}
            {promptOpts && (
              <label className="mt-4 flex flex-col gap-1.5">
                {promptOpts.label && <span className="text-sm font-medium text-slate-700">{promptOpts.label}</span>}
                <input ref={inputRef} type={promptOpts.inputType ?? 'text'} value={value} onChange={(e) => setValue(e.target.value)} />
                {promptOpts.minLength ? <span className="text-xs text-slate-500">At least {promptOpts.minLength} characters</span> : null}
              </label>
            )}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => finish(false)}>
            {opts.cancelText ?? 'Cancel'}
          </Button>
          <Button ref={okRef} type="submit" variant={opts.danger ? 'danger' : 'primary'} disabled={invalid}>
            {opts.confirmText ?? 'OK'}
          </Button>
        </div>
      </form>
    </div>
  );
}
