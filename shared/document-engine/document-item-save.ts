export type SaveableDocumentItem = {
  _clientId: string;
  _parentClientId?: string | null;
  positionNumber?: string | null;
  [key: string]: any;
};

export function buildDocumentItemBulkPayload<T extends SaveableDocumentItem>(
  items: T[],
  positionNumbers: Map<string, string>,
): any[] {
  return items.map((item) => ({
    ...item,
    positionNumber: positionNumbers.get(item._clientId) || item.positionNumber || "",
  }));
}

function bulkPayloadError(message: string): Error & { status?: number } {
  const error: Error & { status?: number } = new Error(message);
  error.status = 400;
  return error;
}

export function validateDocumentItemBulkPayload(items: Array<Record<string, any>>): void {
  const clientIds = new Set<string>();

  for (const item of items) {
    const clientId = typeof item?._clientId === "string" ? item._clientId.trim() : "";
    if (!clientId) continue;
    if (clientIds.has(clientId)) {
      throw bulkPayloadError(`Doppelte Positions-ID im Speichern-Payload: ${clientId}`);
    }
    clientIds.add(clientId);
  }

  for (const item of items) {
    const clientId = typeof item?._clientId === "string" ? item._clientId.trim() : "";
    const parentClientId = typeof item?._parentClientId === "string" ? item._parentClientId.trim() : "";
    if (!parentClientId) continue;
    if (clientId && parentClientId === clientId) {
      throw bulkPayloadError(`Position ${clientId} kann nicht ihr eigener Jumbo-Elternknoten sein`);
    }
    if (!clientIds.has(parentClientId)) {
      throw bulkPayloadError(`Jumbo-Elternposition ${parentClientId} wurde im Speichern-Payload nicht gefunden`);
    }
  }
}

export function restoreEditorClientIds<T extends { id?: number | null; parentItemId?: number | null; [key: string]: any }>(
  savedItems: T[],
): T[] {
  const idToClientId = new Map<number, string>();
  savedItems.forEach((item) => {
    if (!item.id) return;
    idToClientId.set(item.id, item._clientId || `item-${item.id}`);
  });

  return savedItems.map((item) => ({
    ...item,
    _clientId: item._clientId || (item.id ? idToClientId.get(item.id) : undefined) || `item-${Math.random().toString(36).slice(2)}`,
    _parentClientId:
      item._parentClientId ||
      (item.parentItemId && idToClientId.has(item.parentItemId)
        ? idToClientId.get(item.parentItemId)
        : null),
  }));
}
