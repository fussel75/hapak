import type { Project } from "@shared/schema";
import { fmtDocNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, FolderPlus } from "lucide-react";

interface ProjectAssignDialogProps {
  open: boolean;
  onClose: () => void;
  projects: Project[] | undefined;
  projectSearch: string;
  setProjectSearch: (v: string) => void;
  assignProjectId: number | null;
  setAssignProjectId: (v: number | null) => void;
  assignFolderId: number | null;
  setAssignFolderId: (v: number | null) => void;
  assignTreeNodes: any[] | undefined;
  assignToProjectMut: { isPending: boolean; mutate: (v: { projectId: number; parentId?: number }) => void };
}

export function ProjectAssignDialog({
  open,
  onClose,
  projects,
  projectSearch,
  setProjectSearch,
  assignProjectId,
  setAssignProjectId,
  assignFolderId,
  setAssignFolderId,
  assignTreeNodes,
  assignToProjectMut,
}: ProjectAssignDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Dokument zum Projekt hinzufügen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs mb-1 block">Projekt suchen</Label>
            <Input
              placeholder="Projekt suchen..."
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              data-testid="input-project-search"
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto border rounded">
            {(projects || [])
              .filter((p) => {
                if (!projectSearch) return true;
                const s = projectSearch.toLowerCase();
                return (
                  p.name?.toLowerCase().includes(s) ||
                  p.projectNumber?.toLowerCase().includes(s) ||
                  p.shortName?.toLowerCase().includes(s)
                );
              })
              .slice(0, 50)
              .map((p) => (
                <div
                  key={p.id}
                  className={`px-2 py-1 text-xs cursor-pointer hover:bg-accent flex items-center gap-2 ${assignProjectId === p.id ? "bg-blue-100 dark:bg-blue-900" : ""}`}
                  onClick={() => { setAssignProjectId(p.id); setAssignFolderId(null); }}
                  data-testid={`project-option-${p.id}`}
                >
                  <span className="font-mono shrink-0">{fmtDocNumber(p.projectNumber || "")}</span>
                  <span className="truncate">{p.name}</span>
                  {p.shortName && <span className="text-muted-foreground shrink-0">{p.shortName}</span>}
                </div>
              ))}
          </div>
          {assignProjectId && assignTreeNodes && (
            <div>
              <Label className="text-xs mb-1 block">Ordner (optional)</Label>
              <div className="max-h-[150px] overflow-y-auto border rounded">
                <div
                  className={`px-2 py-1 text-xs cursor-pointer hover:bg-accent ${!assignFolderId ? "bg-blue-100 dark:bg-blue-900" : ""}`}
                  onClick={() => setAssignFolderId(null)}
                  data-testid="folder-option-root"
                >
                  — Stammebene —
                </div>
                {assignTreeNodes
                  .filter((n: any) => n.node_type === "folder")
                  .map((f: any) => (
                    <div
                      key={f.id}
                      className={`px-2 py-1 text-xs cursor-pointer hover:bg-accent flex items-center gap-1 ${assignFolderId === f.id ? "bg-blue-100 dark:bg-blue-900" : ""}`}
                      onClick={() => setAssignFolderId(f.id)}
                      style={{ paddingLeft: `${(f.parent_id ? 24 : 8)}px` }}
                      data-testid={`folder-option-${f.id}`}
                    >
                      <FolderPlus className="h-3 w-3 text-amber-500" />
                      <span>{f.folder_name || "Ordner"}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button
            disabled={!assignProjectId || assignToProjectMut.isPending}
            onClick={() => {
              if (assignProjectId) {
                assignToProjectMut.mutate({
                  projectId: assignProjectId,
                  parentId: assignFolderId || undefined,
                });
              }
            }}
            data-testid="button-confirm-assign"
          >
            {assignToProjectMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FolderPlus className="h-4 w-4 mr-2" />}
            Zuordnen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
