import { useCallback, useMemo as useMemoReact } from "react";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { EditorItem } from "../types";

interface UseDragDropParams {
  items: EditorItem[];
  setItems: React.Dispatch<React.SetStateAction<EditorItem[]>>;
  setFocusedRow: React.Dispatch<React.SetStateAction<number | null>>;
  setDirty: React.Dispatch<React.SetStateAction<boolean>>;
  expandedJumbos: Set<string>;
  recalcTitelsummen: (allItems: EditorItem[]) => EditorItem[];
}

export function useDragDrop(params: UseDragDropParams) {
  const {
    items,
    setItems,
    setFocusedRow,
    setDirty,
    expandedJumbos,
    recalcTitelsummen,
  } = params;

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const dragged = items.find((i) => i._clientId === active.id);
      if (!dragged || dragged._parentClientId) return;
      const oldIndex = items.findIndex((i) => i._clientId === active.id);
      const overIndex = items.findIndex((i) => i._clientId === over.id);
      if (oldIndex < 0 || overIndex < 0) return;
      if (dragged.type === "jumbo") {
        const children = items.filter(
          (i) => i._parentClientId === dragged._clientId,
        );
        const without = items.filter(
          (i) =>
            i._clientId !== dragged._clientId &&
            i._parentClientId !== dragged._clientId,
        );
        const targetItem = items[overIndex];
        let insertAt = without.findIndex(
          (i) => i._clientId === targetItem._clientId,
        );
        if (insertAt < 0) insertAt = without.length;
        if (overIndex > oldIndex) insertAt++;
        const updated = [...without];
        updated.splice(insertAt, 0, dragged, ...children);
        updated.forEach((it, i) => {
          it.sortOrder = i;
        });
        setItems(recalcTitelsummen(updated));
        setDirty(true);
      } else {
        const updated = [...items];
        const [moved] = updated.splice(oldIndex, 1);
        updated.splice(overIndex, 0, moved);
        updated.forEach((it, i) => {
          it.sortOrder = i;
        });
        setItems(recalcTitelsummen(updated));
        setFocusedRow(overIndex);
        setDirty(true);
      }
    },
    [items, recalcTitelsummen, setItems, setFocusedRow, setDirty],
  );

  const sortableIds = useMemoReact(() => {
    return items
      .filter((item) => {
        if (!item._parentClientId) return true;
        const parent = items.find((p) => p._clientId === item._parentClientId);
        return parent && expandedJumbos.has(parent._clientId);
      })
      .map((i) => i._clientId!);
  }, [items, expandedJumbos]);

  return { dndSensors, handleDragEnd, sortableIds };
}
