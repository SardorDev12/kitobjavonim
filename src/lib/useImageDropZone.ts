import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, type View } from 'react-native';

/**
 * Web-only HTML5 drag-and-drop for a single dropped image file.
 *
 * Attached via a ref to the underlying DOM node rather than through props:
 * react-native-web renders a View as a real <div>, but there is no RN-level
 * prop for raw drag events, so this reaches past the abstraction to
 * addEventListener directly. On native the effect is a no-op — there is no
 * equivalent concept of dragging a file from the OS onto a mobile app.
 *
 * The ref is a callback ref backed by state, not a plain `useRef`. A zone
 * mounted fresh inside a `Modal` (e.g. the edit-book sheet) can have its
 * listener-attaching effect run before react-native-web's portal has
 * actually committed the underlying DOM node — a plain `useRef` effect
 * reads `.current` as still null at that instant and, since nothing else
 * ever changes its dependencies, never gets another chance to attach.
 * Routing the node through state instead means the effect's own dependency
 * changes the moment the node shows up, however late that commit lands.
 *
 * `onDrop` is read through a ref rather than a dependency so an inline
 * arrow function at the call site doesn't tear down and re-attach the
 * listeners on every render.
 */
export function useImageDropZone(onDrop: (file: File) => void, enabled = true) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const ref = useCallback((instance: View | null) => {
    setNode(instance as unknown as HTMLElement | null);
  }, []);
  const [isDragOver, setIsDragOver] = useState(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || !node) return;

    let dragDepth = 0;

    const handleDragEnter = (event: DragEvent) => {
      event.preventDefault();
      dragDepth += 1;
      setIsDragOver(true);
    };
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };
    const handleDragLeave = (event: DragEvent) => {
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setIsDragOver(false);
    };
    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      dragDepth = 0;
      setIsDragOver(false);

      const file = event.dataTransfer?.files?.[0];
      if (file) onDropRef.current(file);
    };

    node.addEventListener('dragenter', handleDragEnter);
    node.addEventListener('dragover', handleDragOver);
    node.addEventListener('dragleave', handleDragLeave);
    node.addEventListener('drop', handleDrop);

    return () => {
      node.removeEventListener('dragenter', handleDragEnter);
      node.removeEventListener('dragover', handleDragOver);
      node.removeEventListener('dragleave', handleDragLeave);
      node.removeEventListener('drop', handleDrop);
    };
  }, [enabled, node]);

  return { ref, isDragOver };
}
