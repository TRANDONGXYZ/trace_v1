import { useEffect, useMemo, useRef, useState } from 'react';
import { AUTOSAVE_DELAY, STORAGE_KEY, readDiagram, serializeDiagram } from './persistence.js';

export function useLocalDiagram() {
  const [restored] = useState(readDiagram);
  const [graph, setGraph] = useState(() => restored ?? { nodes: [], edges: [] });
  // Persist the content model, which excludes viewport, selection, and highlights.
  // Comparing snapshots also avoids saving for a no-op graph update.
  const content = useMemo(() => serializeDiagram(graph), [graph]);
  const persistedContent = useRef(content);
  const [savedContent, setSavedContent] = useState(() => restored ? content : null);

  useEffect(() => {
    if (content === persistedContent.current) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, content);
        persistedContent.current = content;
        setSavedContent(content);
      } catch {
        // Keep the diagram usable and withhold confirmation if writing fails.
      }
    }, AUTOSAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [content]);

  return [graph, setGraph, content === savedContent];
}
