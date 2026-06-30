import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDocNumber } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface DocumentTab {
  id: string;
  documentId: number | null;
  label: string;
  documentNumber: string;
  type: string;
  isNew: boolean;
}

interface DocumentTabsContextType {
  tabs: DocumentTab[];
  activeTabId: string | null;
  openDocument: (documentId: number, label: string, documentNumber: string, type: string) => void;
  openNewDocument: (type: string) => void;
  closeTab: (tabId: string, afterClose?: () => void) => boolean;
  setActiveTab: (tabId: string) => void;
  updateTabLabel: (tabId: string, label: string, documentNumber?: string) => void;
  getClipboard: () => ClipboardItem[];
  setClipboard: (items: ClipboardItem[]) => void;
  registerDirtyCheck: (tabId: string, check: () => boolean) => void;
  unregisterDirtyCheck: (tabId: string) => void;
}

export interface ClipboardItem {
  type: string;
  title: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  laborPrice: string;
  materialPrice: string;
}

const documentTypeShort: Record<string, string> = {
  angebot: "AG",
  auftragsbestaetigung: "AB",
  rechnung: "AR",
  abschlagsrechnung: "AR",
  gutschrift: "GS",
  freies_dokument: "FD",
  bestellung: "BE",
  lieferschein: "LS",
  leistungsverzeichnis: "LV",
};

const DocumentTabsContext = createContext<DocumentTabsContextType | null>(null);

export function DocumentTabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<DocumentTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [clipboard, setClipboardState] = useState<ClipboardItem[]>([]);
  const [pendingClose, setPendingClose] = useState<{ tabId: string; afterClose?: () => void } | null>(null);
  const dirtyChecksRef = useRef<Map<string, () => boolean>>(new Map());

  const openDocument = useCallback((documentId: number, label: string, documentNumber: string, type: string) => {
    setTabs(prev => {
      const existing = prev.find(t => t.documentId === documentId);
      if (existing) {
        setActiveTabId(existing.id);
        return prev;
      }
      const tabId = `doc-${documentId}`;
      const newTab: DocumentTab = { id: tabId, documentId, label, documentNumber, type, isNew: false };
      setActiveTabId(tabId);
      return [...prev, newTab];
    });
  }, []);

  const openNewDocument = useCallback((type: string) => {
    const tabId = `new-${Date.now()}`;
    const newTab: DocumentTab = { id: tabId, documentId: null, label: "Neues Dokument", documentNumber: "", type, isNew: true };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(tabId);
  }, []);

  const performCloseTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
      }
      return newTabs;
    });
    dirtyChecksRef.current.delete(tabId);
  }, [activeTabId]);

  const closeTab = useCallback((tabId: string, afterClose?: () => void): boolean => {
    const dirtyCheck = dirtyChecksRef.current.get(tabId);
    if (dirtyCheck && dirtyCheck()) {
      setPendingClose({ tabId, afterClose });
      return false;
    }
    performCloseTab(tabId);
    afterClose?.();
    return true;
  }, [performCloseTab]);

  const registerDirtyCheck = useCallback((tabId: string, check: () => boolean) => {
    dirtyChecksRef.current.set(tabId, check);
  }, []);

  const unregisterDirtyCheck = useCallback((tabId: string) => {
    dirtyChecksRef.current.delete(tabId);
  }, []);

  const setActiveTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const updateTabLabel = useCallback((tabId: string, label: string, documentNumber?: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, label, ...(documentNumber !== undefined ? { documentNumber } : {}) } : t));
  }, []);

  return (
    <DocumentTabsContext.Provider value={{
      tabs, activeTabId, openDocument, openNewDocument, closeTab, setActiveTab, updateTabLabel,
      getClipboard: () => clipboard,
      setClipboard: setClipboardState,
      registerDirtyCheck,
      unregisterDirtyCheck,
    }}>
      {children}
      <AlertDialog open={pendingClose !== null} onOpenChange={(open) => !open && setPendingClose(null)}>
        <AlertDialogContent data-testid="dialog-close-dirty-document-tab">
          <AlertDialogHeader>
            <AlertDialogTitle>Ungespeicherte Aenderungen verwerfen?</AlertDialogTitle>
            <AlertDialogDescription>
              Das Dokument hat ungespeicherte Aenderungen. Beim Schliessen des Tabs gehen diese Aenderungen verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-close-dirty-document-tab">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-close-dirty-document-tab"
              onClick={() => {
                if (!pendingClose) return;
                const { tabId, afterClose } = pendingClose;
                performCloseTab(tabId);
                setPendingClose(null);
                afterClose?.();
              }}
            >
              Verwerfen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DocumentTabsContext.Provider>
  );
}

export function useDocumentTabs() {
  const ctx = useContext(DocumentTabsContext);
  if (!ctx) throw new Error("useDocumentTabs must be used within DocumentTabsProvider");
  return ctx;
}

export function DocumentTabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useDocumentTabs();
  const [, navigate] = useLocation();

  if (tabs.length === 0) return null;

  const handleTabClick = (tab: DocumentTab) => {
    setActiveTab(tab.id);
    if (tab.documentId) {
      navigate(`/dokumente/${tab.documentId}/bearbeiten`);
    }
  };

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const navigateAfterClose = () => {
      if (tabId !== activeTabId) return;
      const remaining = tabs.filter(t => t.id !== tabId);
      if (remaining.length > 0) {
        const last = remaining[remaining.length - 1];
        if (last.documentId) {
          navigate(`/dokumente/${last.documentId}/bearbeiten`);
        } else {
          navigate("/dokumente/neu");
        }
      } else {
        navigate("/dokumente");
      }
    };
    closeTab(tabId, navigateAfterClose);
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-300/70 bg-slate-900/95 shadow-lg backdrop-blur"
      data-testid="document-tab-bar"
    >
      <div className="flex items-center h-9 overflow-x-auto px-2 gap-1">
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 px-2 shrink-0 select-none">Dokumente</span>
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          const short = documentTypeShort[tab.type] || "DOK";
          return (
            <button
              key={tab.id}
              className={cn(
                "group flex items-center gap-1.5 h-7 px-2 rounded-md text-[10px] shrink-0 transition-all max-w-[240px] whitespace-nowrap overflow-hidden border",
                isActive
                  ? "bg-white/14 text-white border-white/20 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/6 border-transparent"
              )}
              onClick={() => handleTabClick(tab)}
              data-testid={`tab-doc-${tab.documentId || 'new'}`}
            >
              <FileText className="h-3 w-3 shrink-0 text-cyan-400" />
              <span className="font-medium shrink-0">{short}</span>
              {tab.documentNumber && (
                <span className="text-slate-300 tabular-nums shrink-0">{fmtDocNumber(tab.documentNumber)}</span>
              )}
              <span className="truncate text-slate-400" title={tab.label}>
                {tab.label}
              </span>
              <span
                className={cn(
                  "ml-auto shrink-0 rounded p-0.5 transition-colors",
                  isActive ? "hover:bg-white/20" : "opacity-0 group-hover:opacity-100 hover:bg-white/10"
                )}
                onClick={(e) => handleClose(e, tab.id)}
                role="button"
                data-testid={`tab-close-${tab.documentId || 'new'}`}
              >
                <X className="h-2.5 w-2.5" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

