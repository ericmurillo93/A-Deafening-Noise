import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useDialogFocus } from "../hooks/useUi";
import { useI18n } from "../lib/i18n.jsx";

const Context = createContext(null);
export function useDialogGuard() { return useContext(Context); }
export function usePendingDialogChanges(dirty, busy = false) {
  const guard = useDialogGuard();
  const key = useRef(Symbol());
  useEffect(() => {
    guard?.register(key.current, { dirty, busy });
    return () => guard?.register(key.current, null);
  }, [guard, dirty, busy]);
}

export function DialogGuardProvider({ children }) {
  const { t } = useI18n();
  const entries = useRef(new Map());
  const [pending, setPending] = useState(null);
  const [busyMessage, setBusyMessage] = useState(false);
  const dialogRef = useDialogFocus(Boolean(pending));
  const api = useRef(null);
  useEffect(() => {
    if (!pending) return;
    const escape = event => { if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); setPending(null); } };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [pending]);
  if (!api.current) api.current = {
    register: (key, state) => state ? entries.current.set(key, state) : entries.current.delete(key),
    canClose: () => ![...entries.current.values()].some(state => state.dirty || state.busy),
    reset: () => { entries.current.clear(); setPending(null); setBusyMessage(false); },
    requestClose: action => {
      if ([...entries.current.values()].some(state => state.busy)) { setBusyMessage(true); return false; }
      if ([...entries.current.values()].some(state => state.dirty)) { setPending(() => action); return false; }
      action(); return true;
    },
  };
  useEffect(() => {
    if (!busyMessage) return;
    const timer = setTimeout(() => setBusyMessage(false), 3000);
    return () => clearTimeout(timer);
  }, [busyMessage]);
  return <Context.Provider value={api.current}>{children}
    {busyMessage && <p role="status" className="fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-md border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100">{t("Please wait until saving finishes.")}</p>}
    {pending && <div className="adn-modal-backdrop fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-4"><section ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="discard-dialog-title" aria-describedby="discard-dialog-description" className="adn-modal-panel w-full max-w-sm p-6">
      <h2 id="discard-dialog-title" className="text-lg font-bold text-zinc-100">{t("Discard unsaved changes?")}</h2>
      <p id="discard-dialog-description" className="mt-2 text-sm text-zinc-400">{t("Your saved information will not be changed.")}</p>
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" className="adn-button-secondary" onClick={() => setPending(null)}>{t("Keep editing")}</button><button type="button" className="adn-button-danger" onClick={() => { api.current.reset(); setPending(null); pending(); }}>{t("Discard changes")}</button></div>
    </section></div>}
  </Context.Provider>;
}
