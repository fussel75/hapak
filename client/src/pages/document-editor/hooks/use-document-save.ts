import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { documentTypeLabels } from "@shared/schema";
import type { Document, DocumentItem } from "@shared/schema";
import type { EditorItem } from "../types";
import { buildDocumentSavePayload } from "@shared/document-engine/document-form";
import {
  buildDocumentItemBulkPayload,
  restoreEditorClientIds,
} from "@shared/document-engine/document-item-save";

interface UseDocumentSaveParams {
  items: EditorItem[];
  setItems: React.Dispatch<React.SetStateAction<EditorItem[]>>;
  setDirty: React.Dispatch<React.SetStateAction<boolean>>;
  docForm: Record<string, any>;
  nextDocNumber: string;
  documentId: number | undefined;
  isNew: boolean;
  navigate: (to: string) => void;
  positionNumbers: Map<string, string>;
  netTotal: number;
  taxAmount: number;
  grossTotal: number;
  laborTotal: number;
  isAbschlagOrSchluss: boolean;
  abschlagData: { totalPreviouslyInvoiced?: string } | undefined;
}

export function useDocumentSave(params: UseDocumentSaveParams) {
  const {
    items,
    setItems,
    setDirty,
    docForm,
    nextDocNumber,
    documentId,
    isNew,
    navigate,
    positionNumbers,
    netTotal,
    taxAmount,
    grossTotal,
    laborTotal,
    isAbschlagOrSchluss,
    abschlagData,
  } = params;
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const prevInvoiced = abschlagData?.totalPreviouslyInvoiced || "0.00";
      const docData = buildDocumentSavePayload({
        docForm,
        nextDocNumber,
        netTotal,
        taxAmount,
        grossTotal,
        laborTotal,
        isAbschlagOrSchluss,
        previouslyInvoiced: prevInvoiced,
      });
      const res = await apiRequest("POST", "/api/documents/full-save", {
        document: documentId ? { ...docData, id: documentId } : docData,
        items: buildDocumentItemBulkPayload(items, positionNumbers),
      });
      const saved: { document: Document; items: DocumentItem[] } = await res.json();
      setItems(restoreEditorClientIds(saved.items) as EditorItem[]);
      const savedDoc = saved.document;
      return savedDoc;
    },
    onSuccess: async (savedDoc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setDirty(false);
      toast({
        title: "Gespeichert",
        description: `${documentTypeLabels[savedDoc.type]} ${savedDoc.documentNumber}`,
      });
      if (isNew && docForm.projectId) queryClient.invalidateQueries({ queryKey: ["/api/projects", docForm.projectId, "document-tree"] });
      if (isNew) navigate(`/dokumente/${savedDoc.id}/bearbeiten`);
    },
    onError: (err: any) =>
      toast({
        title: "Fehler beim Speichern",
        description: err.message,
        variant: "destructive",
      }),
  });

  const convertMutation = useMutation({
    mutationFn: async (targetType: string) => {
      if (documentId) {
        const prevInvoiced = abschlagData?.totalPreviouslyInvoiced || "0.00";
        const docData = buildDocumentSavePayload({
          docForm,
          nextDocNumber,
          netTotal,
          taxAmount,
          grossTotal,
          laborTotal,
          isAbschlagOrSchluss,
          previouslyInvoiced: prevInvoiced,
        });
        await apiRequest("POST", "/api/documents/full-save", {
          document: { ...docData, id: documentId },
          items: buildDocumentItemBulkPayload(items, positionNumbers),
        });
      }
      const r = await apiRequest(
        "POST",
        `/api/documents/${documentId}/convert`,
        { targetType },
      );
      return r.json();
    },
    onSuccess: (newDoc: Document) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      if (newDoc.projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", newDoc.projectId, "document-tree"] });
      }
      toast({
        title: "Umgewandelt",
        description: `${documentTypeLabels[newDoc.type]} ${newDoc.documentNumber}`,
      });
      navigate(`/dokumente/${newDoc.id}/bearbeiten`);
    },
    onError: (err: any) =>
      toast({
        title: "Fehler",
        description: err.message,
        variant: "destructive",
      }),
  });

  return { saveMutation, convertMutation };
}
