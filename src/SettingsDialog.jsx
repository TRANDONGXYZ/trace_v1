import React, { useEffect, useRef, useState } from 'react';
import { MAX_BACKUP_BYTES, parseBackup, saveBackupFile } from './backup.js';
import { useAppearance } from './AppearanceProvider.jsx';

export function SettingsDialog({ getGraph, onImport, onClose }) {
  const appearance = useAppearance();
  const dialog = useRef(null), file = useRef(null), request = useRef(0);
  const [candidate, setCandidate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    dialog.current.showModal(); dialog.current.querySelector('.export-button').focus();
    return () => { request.current++; };
  }, []);
  const read = async event => {
    const selected = event.target.files?.[0]; event.target.value = '';
    if (!selected) return;
    const identity = ++request.current;
    setBusy(true); setError(''); setStatus(''); setCandidate(null);
    try {
      if (selected.size > MAX_BACKUP_BYTES) throw new Error('Choose a Trace JSON backup no larger than 25 MiB.');
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(await selected.arrayBuffer()); }
      catch { throw new Error('The backup is not valid UTF-8 JSON. No data was imported.'); }
      const graph = parseBackup(text);
      if (identity === request.current) setCandidate(graph);
    } catch (failure) { if (identity === request.current) setError(failure.message); }
    finally { if (identity === request.current) setBusy(false); }
  };
  const exportData = async () => {
    const identity = ++request.current;
    setBusy(true); setError(''); setStatus(''); setCandidate(null);
    try {
      const message = await saveBackupFile(getGraph());
      if (identity === request.current) setStatus(message);
    } catch (failure) { if (identity === request.current && failure.name !== 'AbortError') setError(`Export failed: ${failure.message}`); }
    finally { if (identity === request.current) setBusy(false); }
  };
  const confirm = () => {
    try {
      onImport(candidate);
      setCandidate(null); setError(''); setStatus('Whiteboard imported and saved locally.');
    } catch {
      setError('The imported whiteboard could not be saved. Browser storage may be full or unavailable. Your current diagram and its saved data are unchanged.');
    }
  };
  return <dialog ref={dialog} className="settings-dialog" onCancel={onClose} aria-labelledby="settings-title">
    <div className="dialog-heading"><h1 id="settings-title">Settings</h1><button type="button" className="close-dialog" aria-label="Close settings" onClick={onClose}>×</button></div>
    <label htmlFor="appearance">Appearance</label>
    <select id="appearance" value={appearance.mode} onChange={event => appearance.changeMode(event.target.value)}>
      <option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option>
    </select>
    {appearance.error && <p role="alert">{appearance.error}</p>}
    <p className="backup-privacy">Backups stay on your device. Exported JSON is <strong>not encrypted</strong> and may contain personal reflections; store it securely.</p>
    <div className="backup-actions">
      <button type="button" className="export-button" disabled={busy} onClick={exportData}>Export Data</button>
      <button type="button" disabled={busy} onClick={() => file.current.click()}>Import Data</button>
    </div>
    <input ref={file} type="file" accept=".json,application/json" hidden aria-label="Trace backup file" onChange={read} />
    {busy && <p role="status">Preparing backup…</p>}
    {candidate && <section className="import-confirmation" aria-label="Confirm import">
      <p>Replace the current whiteboard with {candidate.nodes.length} nodes and {candidate.edges.length} connections? This clears the current undo/redo history.</p>
      <button type="button" onClick={confirm}>Replace whiteboard</button>
      <button type="button" onClick={() => { setCandidate(null); setError(''); }}>Cancel import</button>
    </section>}
    {error && <p role="alert">{error}</p>}
    {status && <p role="status">{status}</p>}
  </dialog>;
}
