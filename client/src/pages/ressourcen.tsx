import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ResourcePlan, User, Project } from "@shared/schema";
import { fmtNumber, fmtDate, fmtDocNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Calendar, Users } from "lucide-react";

const PROJECT_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-orange-500", "bg-purple-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-red-500",
  "bg-amber-500", "bg-cyan-500",
];

function getProjectColor(projectId: number): string {
  return PROJECT_COLORS[projectId % PROJECT_COLORS.length];
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDateShort(date: Date): string {
  return `${date.getDate()}.${date.getMonth() + 1}.`;
}

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function ResourcePlanForm({ plan, users, projects, onSave, onCancel }: {
  plan?: ResourcePlan;
  users: User[];
  projects: Project[];
  onSave: (data: any) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    employeeId: plan?.employeeId || 0,
    projectId: plan?.projectId || 0,
    startDate: plan?.startDate || toDateStr(new Date()),
    endDate: plan?.endDate || toDateStr(addDays(new Date(), 7)),
    hoursPerDay: plan?.hoursPerDay || "8.0",
    notes: plan?.notes || "",
  });

  const update = (field: string, value: any) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = () => {
    if (!form.employeeId || !form.projectId) return;
    onSave({
      ...form,
      employeeId: Number(form.employeeId),
      projectId: Number(form.projectId),
      hoursPerDay: String(form.hoursPerDay),
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Mitarbeiter *</Label>
          <Select value={String(form.employeeId)} onValueChange={(v) => update("employeeId", parseInt(v))}>
            <SelectTrigger data-testid="select-employee"><SelectValue placeholder="Mitarbeiter wählen" /></SelectTrigger>
            <SelectContent>
              {users.filter(u => u.active).map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Projekt *</Label>
          <Select value={String(form.projectId)} onValueChange={(v) => update("projectId", parseInt(v))}>
            <SelectTrigger data-testid="select-project"><SelectValue placeholder="Projekt wählen" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name} ({fmtDocNumber(p.projectNumber)})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Startdatum *</Label>
          <Input type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} data-testid="input-start-date" />
        </div>
        <div className="space-y-2">
          <Label>Enddatum *</Label>
          <Input type="date" value={form.endDate} onChange={(e) => update("endDate", e.target.value)} data-testid="input-end-date" />
        </div>
        <div className="space-y-2">
          <Label>Stunden/Tag</Label>
          <Input type="number" step="0.5" min="0" max="24" value={form.hoursPerDay} onChange={(e) => update("hoursPerDay", e.target.value)} data-testid="input-hours-per-day" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Notizen</Label>
        <Input value={form.notes} onChange={(e) => update("notes", e.target.value)} data-testid="input-notes" />
      </div>
      <div className="flex gap-2 justify-end pt-4">
        <Button variant="secondary" onClick={onCancel} data-testid="button-cancel">Abbrechen</Button>
        <Button onClick={handleSubmit} data-testid="button-save-resource-plan">Speichern</Button>
      </div>
    </div>
  );
}

export default function RessourcenPage() {
  const [viewMode, setViewMode] = useState<"weekly" | "monthly">("weekly");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<ResourcePlan | undefined>();
  const [filterProjectId, setFilterProjectId] = useState<string>("");
  const { toast } = useToast();

  const queryUrl = filterProjectId ? `/api/resource-plans?projectId=${filterProjectId}` : "/api/resource-plans";
  const { data: plans, isLoading } = useQuery<ResourcePlan[]>({ queryKey: ["/api/resource-plans", filterProjectId || "all"] });
  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: projects } = useQuery<Project[]>({ queryKey: ["/api/projects"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/resource-plans", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resource-plans"] });
      setDialogOpen(false);
      toast({ title: "Ressourcenplan erstellt" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/resource-plans/${editPlan!.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resource-plans"] });
      setDialogOpen(false);
      setEditPlan(undefined);
      toast({ title: "Ressourcenplan aktualisiert" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/resource-plans/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resource-plans"] });
      toast({ title: "Ressourcenplan gelöscht" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const userMap = useMemo(() => new Map(users?.map((u) => [u.id, u]) || []), [users]);
  const projectMap = useMemo(() => new Map(projects?.map((p) => [p.id, p]) || []), [projects]);

  const timelineDays = useMemo(() => {
    const days: Date[] = [];
    let start: Date;
    let count: number;
    if (viewMode === "weekly") {
      start = startOfWeek(currentDate);
      count = 7;
    } else {
      start = startOfMonth(currentDate);
      count = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    }
    for (let i = 0; i < count; i++) {
      days.push(addDays(start, i));
    }
    return days;
  }, [viewMode, currentDate]);

  const employeeIds = useMemo(() => {
    const ids = new Set<number>();
    plans?.forEach((p) => ids.add(p.employeeId));
    users?.filter(u => u.active).forEach(u => ids.add(u.id));
    return Array.from(ids);
  }, [plans, users]);

  const getPlansForEmployeeDay = (employeeId: number, day: Date): ResourcePlan[] => {
    const dayStr = toDateStr(day);
    return (plans || []).filter((p) =>
      p.employeeId === employeeId && p.startDate <= dayStr && p.endDate >= dayStr
    );
  };

  const getEmployeeCapacity = (employeeId: number) => {
    const workDays = timelineDays.filter(d => !isWeekend(d)).length;
    const available = workDays * 8;
    let planned = 0;
    timelineDays.forEach(day => {
      if (isWeekend(day)) return;
      const dayPlans = getPlansForEmployeeDay(employeeId, day);
      dayPlans.forEach(p => {
        planned += parseFloat(p.hoursPerDay || "8");
      });
    });
    return { available, planned };
  };

  const navigate = (dir: number) => {
    if (viewMode === "weekly") {
      setCurrentDate(addDays(currentDate, dir * 7));
    } else {
      const d = new Date(currentDate);
      d.setMonth(d.getMonth() + dir);
      setCurrentDate(d);
    }
  };

  const weekDayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-ressourcen-title">Ressourcenplanung</h1>
          <p className="text-muted-foreground">{plans?.length ?? 0} Zuweisungen</p>
        </div>
        <Button onClick={() => { setEditPlan(undefined); setDialogOpen(true); }} data-testid="button-new-resource-plan">
          <Plus className="h-4 w-4 mr-2" />Neue Zuweisung
        </Button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
            <SelectTrigger className="w-40" data-testid="select-view-mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Wochenansicht</SelectItem>
              <SelectItem value="monthly">Monatsansicht</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterProjectId} onValueChange={setFilterProjectId}>
            <SelectTrigger className="w-52" data-testid="select-filter-project"><SelectValue placeholder="Alle Projekte" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Projekte</SelectItem>
              {projects?.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)} data-testid="button-prev">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center" data-testid="text-date-range">
            {formatDateShort(timelineDays[0])} - {formatDateShort(timelineDays[timelineDays.length - 1])}
          </span>
          <Button variant="outline" size="icon" onClick={() => navigate(1)} data-testid="button-next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setCurrentDate(new Date())} data-testid="button-today">Heute</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b">
                  <th className="sticky left-0 z-10 bg-card p-2 text-left text-sm font-medium min-w-[160px]">
                    <div className="flex items-center gap-1"><Users className="h-4 w-4" />Mitarbeiter</div>
                  </th>
                  {timelineDays.map((day, i) => {
                    const weekend = isWeekend(day);
                    return (
                      <th key={i} className={`p-1 text-center text-xs font-medium min-w-[40px] ${weekend ? "bg-muted/50" : ""}`}>
                        <div>{viewMode === "weekly" ? weekDayNames[i] : day.getDate()}</div>
                        <div className="text-muted-foreground">{formatDateShort(day)}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {employeeIds.map((empId) => {
                  const user = userMap.get(empId);
                  if (!user) return null;
                  return (
                    <tr key={empId} className="border-b" data-testid={`row-employee-${empId}`}>
                      <td className="sticky left-0 z-10 bg-card p-2 text-sm font-medium">{user.fullName}</td>
                      {timelineDays.map((day, i) => {
                        const weekend = isWeekend(day);
                        const dayPlans = getPlansForEmployeeDay(empId, day);
                        return (
                          <td key={i} className={`p-0.5 ${weekend ? "bg-muted/50" : ""}`}>
                            {dayPlans.map((plan) => {
                              const project = projectMap.get(plan.projectId);
                              return (
                                <div
                                  key={plan.id}
                                  className={`${getProjectColor(plan.projectId)} text-white text-[10px] rounded-sm px-1 py-0.5 truncate cursor-pointer mb-0.5`}
                                  title={`${project?.name || "?"} - ${fmtNumber(plan.hoursPerDay, 1)} Std`}
                                  onClick={() => { setEditPlan(plan); setDialogOpen(true); }}
                                  data-testid={`block-plan-${plan.id}`}
                                >
                                  {fmtNumber(plan.hoursPerDay, 1)}
                                </div>
                              );
                            })}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {employeeIds.length === 0 && (
                  <tr><td colSpan={timelineDays.length + 1} className="text-center text-muted-foreground py-8">Keine Zuweisungen vorhanden</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {employeeIds.map((empId) => {
          const user = userMap.get(empId);
          if (!user) return null;
          const { available, planned } = getEmployeeCapacity(empId);
          const percent = available > 0 ? Math.min(100, (planned / available) * 100) : 0;
          return (
            <Card key={empId} data-testid={`card-capacity-${empId}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{user.fullName}</CardTitle>
                <Badge variant="secondary">{fmtNumber(percent, 0)}%</Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={percent} className="h-2" data-testid={`progress-capacity-${empId}`} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Geplant: {fmtNumber(planned, 1)} Std</span>
                  <span>Verfügbar: {fmtNumber(available, 1)} Std</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {plans && plans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Zuweisungen</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b text-sm text-muted-foreground">
                  <th className="p-2 text-left">Mitarbeiter</th>
                  <th className="p-2 text-left">Projekt</th>
                  <th className="p-2 text-left">Zeitraum</th>
                  <th className="p-2 text-right">Std/Tag</th>
                  <th className="p-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id} className="border-b" data-testid={`row-plan-${plan.id}`}>
                    <td className="p-2 text-sm">{userMap.get(plan.employeeId)?.fullName || "-"}</td>
                    <td className="p-2 text-sm">
                      <div className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${getProjectColor(plan.projectId)}`} />
                        {projectMap.get(plan.projectId)?.name || "-"}
                      </div>
                    </td>
                    <td className="p-2 text-sm">{fmtDate(plan.startDate)} – {fmtDate(plan.endDate)}</td>
                    <td className="p-2 text-sm text-right">{fmtNumber(plan.hoursPerDay, 1)} Std</td>
                    <td className="p-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => { setEditPlan(plan); setDialogOpen(true); }} data-testid={`button-edit-plan-${plan.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(plan.id)} data-testid={`button-delete-plan-${plan.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditPlan(undefined); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editPlan ? "Zuweisung bearbeiten" : "Neue Zuweisung"}</DialogTitle>
          </DialogHeader>
          <ResourcePlanForm
            plan={editPlan}
            users={users || []}
            projects={projects || []}
            onSave={(data) => editPlan ? updateMutation.mutate(data) : createMutation.mutate(data)}
            onCancel={() => { setDialogOpen(false); setEditPlan(undefined); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
