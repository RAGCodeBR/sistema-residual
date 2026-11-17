import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { endOfWeek, format, isPast, isToday, isTomorrow, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  useTasks,
  useColumns,
  useClients,
  useProfiles,
  useSubtasks,
  useTaskCollaborators,
  type Task,
} from "@/hooks/use-data";
import { useAuth } from "@/hooks/use-auth";
import { TaskFilters, applyTaskFilters, type TaskFilterValue } from "@/components/TaskFilters";
import { TaskDialog } from "@/components/TaskDialog";
import { priorityColors, priorityLabels } from "@/lib/task-utils";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/tasks/list")({
  component: ListPage,
  validateSearch: (s: Record<string, unknown>) => ({
    task: typeof s.task === "string" ? s.task : undefined,
    mine: s.mine === "1" || s.mine === true || s.mine === "true" ? true : undefined,
  }),
});

function ListPage() {
  const { data: tasks = [] } = useTasks();
  const { data: clients = [] } = useClients();
  const { data: profiles = [] } = useProfiles();
  const { data: subtasks = [] } = useSubtasks();
  const { data: collaborators = [] } = useTaskCollaborators();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: columns = [] } = useColumns();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<TaskFilterValue>(() =>
    search.mine ? { scope: "mine" } : {},
  );
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Task | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  // Auto-open a task when arriving with ?task=<id>
  useEffect(() => {
    if (!search.task) return;
    const t = tasks.find((x) => x.id === search.task);
    if (t) {
      setEdit(t);
      setOpen(true);
      navigate({
        to: "/tasks/list",
        search: (p: any) => ({ ...p, task: undefined }),
        replace: true,
      });
    }
  }, [search.task, tasks, navigate]);

  const subtaskAssigneeTaskIds = useMemo(() => {
    const s = new Set<string>();
    if (!user?.id) return s;
    for (const st of subtasks as any[])
      if (st.assignee_id === user.id && st.task_id) s.add(st.task_id);
    return s;
  }, [subtasks, user?.id]);

  const subtaskAssigneeTaskIdsByUser = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const st of subtasks as any[]) {
      if (!st.assignee_id || !st.task_id) continue;
      const set = map.get(st.assignee_id) ?? new Set<string>();
      set.add(st.task_id);
      map.set(st.assignee_id, set);
    }
    return map;
  }, [subtasks]);

  const collaboratorTaskIds = useMemo(
    () => new Set(collaborators.filter((collaborator) => collaborator.collaborator_id === user?.id).map((collaborator) => collaborator.task_id)),
    [collaborators, user?.id],
  );

  const list = useMemo(() => {
    const r = applyTaskFilters(tasks, filters, {
      userId: user?.id ?? null,
      subtaskAssigneeTaskIds,
      collaboratorTaskIds,
      subtaskAssigneeTaskIdsByUser,
    });
    return r.filter((task) => task.status !== "done" && !task.completed_at).sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  }, [tasks, filters, user?.id, subtaskAssigneeTaskIds, collaboratorTaskIds, subtaskAssigneeTaskIdsByUser]);

  const completeTask = async (taskId: string) => {
    const { error } = await supabase
      .from("tasks")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    if (error) {
      toast.error(error.message);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    toast.success("Tarefa concluída.");
  };

  const moveToTrash = async (task: Task) => {
    if (!confirm(`Mover a tarefa “${task.title}” para a lixeira?`)) return;
    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
      .eq("id", task.id);
    if (error) return toast.error(error.message);
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["tasks", "deleted"] });
    toast.success("Tarefa movida para a lixeira.");
  };

  const toggleTaskSelection = (taskId: string, checked: boolean) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      checked ? next.add(taskId) : next.delete(taskId);
      return next;
    });
  };

  const selectAllVisibleTasks = (checked: boolean) => {
    setSelectedTaskIds(checked ? new Set(list.map((task) => task.id)) : new Set());
  };

  const moveSelectedToTrash = async () => {
    const ids = [...selectedTaskIds].filter((id) => list.some((task) => task.id === id));
    if (!ids.length) return;
    if (!confirm(`Mover ${ids.length} tarefa(s) selecionada(s) para a lixeira?`)) return;

    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
      .in("id", ids);
    if (error) return toast.error(error.message);

    setSelectedTaskIds(new Set());
    setSelectMode(false);
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["tasks", "deleted"] });
    toast.success(`${ids.length} tarefa(s) movida(s) para a lixeira.`);
  };

  // Celular: agrupa a lista (já ordenada por prazo) em faixas de tempo.
  const mobileGroups = useMemo(() => {
    const now = new Date();
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const defs = [
      { key: "overdue", label: "Atrasadas" },
      { key: "today", label: "Hoje" },
      { key: "tomorrow", label: "Amanhã" },
      { key: "week", label: "Esta semana" },
      { key: "later", label: "Próximas" },
      { key: "none", label: "Sem prazo" },
    ] as const;
    const buckets = new Map<string, Task[]>(defs.map((d) => [d.key, []]));
    for (const t of list) {
      let key: (typeof defs)[number]["key"] = "none";
      if (t.due_date) {
        const due = new Date(t.due_date);
        if (isToday(due)) key = "today";
        else if (due < startOfDay(now)) key = "overdue";
        else if (isTomorrow(due)) key = "tomorrow";
        else if (due <= weekEnd) key = "week";
        else key = "later";
      }
      buckets.get(key)!.push(t);
    }
    return defs.map((d) => ({ ...d, tasks: buckets.get(d.key)! })).filter((g) => g.tasks.length > 0);
  }, [list]);

  const allVisibleSelected = list.length > 0 && list.every((task) => selectedTaskIds.has(task.id));

  return (
    <div className="space-y-4 p-6 max-md:space-y-3 max-md:p-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-display text-base font-bold tabular-nums text-foreground">{list.length}</span>{" "}
          {list.length === 1 ? "tarefa" : "tarefas"}
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 rounded-full px-3 text-sm md:hidden"
            aria-pressed={selectMode}
            onClick={() => {
              setSelectMode((on) => !on);
              setSelectedTaskIds(new Set());
            }}
          >
            {selectMode ? "Pronto" : "Selecionar"}
          </Button>
          <Button
            className="max-md:h-10 max-md:w-10 max-md:rounded-full max-md:p-0"
            aria-label="Nova tarefa"
            onClick={() => {
              setEdit(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4 max-md:h-5 max-md:w-5" />
            <span className="max-md:sr-only">Nova tarefa</span>
          </Button>
        </div>
      </header>
      <TaskFilters filters={filters} onChange={setFilters} />

      {selectedTaskIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-accent/50 px-3 py-2 text-sm animate-in fade-in slide-in-from-top-1 duration-200 max-md:fixed max-md:inset-x-3 max-md:bottom-[max(1rem,env(safe-area-inset-bottom))] max-md:z-40 max-md:flex-nowrap max-md:rounded-full max-md:border-border max-md:bg-background/95 max-md:py-1.5 max-md:pl-4 max-md:pr-1.5 max-md:shadow-lg max-md:backdrop-blur max-md:slide-in-from-bottom-4">
          <span className="font-medium text-accent-foreground">
            <span className="tabular-nums">{selectedTaskIds.size}</span> <span className="max-md:hidden">tarefa(s) selecionada(s)</span><span className="md:hidden">{selectedTaskIds.size === 1 ? "selecionada" : "selecionadas"}</span>
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setSelectedTaskIds(new Set()); setSelectMode(false); }}>
              Cancelar
            </Button>
            <Button size="sm" variant="destructive" onClick={() => void moveSelectedToTrash()}>
              <Trash2 className="h-4 w-4" /><span className="max-md:hidden">Mover para a lixeira</span><span className="md:hidden">Lixeira</span>
            </Button>
          </div>
        </div>
      )}

      {/* Celular: linhas leves agrupadas por prazo. Círculo conclui; "Selecionar" ativa a lixeira em lote. */}
      <div className={`space-y-4 md:hidden ${selectMode ? "pb-20" : ""}`}>
        {list.length === 0 ? (
          <div className="rounded-2xl border bg-card py-12 text-center">
            <p className="font-medium">Nenhuma tarefa encontrada</p>
            <p className="mt-1 text-xs text-muted-foreground">Ajuste os filtros ou crie uma nova tarefa.</p>
          </div>
        ) : (
          mobileGroups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h3 className={`mb-1.5 flex items-baseline gap-2 px-1 text-xs font-semibold ${group.key === "overdue" ? "text-destructive" : "text-muted-foreground"}`}>
                {group.label}
                <span className="font-normal tabular-nums opacity-70">{group.tasks.length}</span>
              </h3>
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {group.tasks.map((t) => {
                  const client = clients.find((c) => c.id === t.client_id);
                  const assignee = profiles.find((p) => p.id === t.assignee_id);
                  const statusColumn = columns.find((column) => column.id === t.column_id);
                  const done = t.completed_at !== null;
                  const overdue = t.due_date && isPast(new Date(t.due_date)) && t.status !== "done" && !done;
                  const selected = selectedTaskIds.has(t.id);
                  const when = t.due_date
                    ? group.key === "today" || group.key === "tomorrow"
                      ? t.due_time ? t.due_time.slice(0, 5) : null
                      : `${format(new Date(t.due_date), "dd MMM", { locale: ptBR })}${t.due_time ? ` · ${t.due_time.slice(0, 5)}` : ""}`
                    : null;
                  return (
                    <li key={t.id} className={`flex items-center gap-1 pr-3 transition-colors ${selected ? "bg-accent/50" : ""}`}>
                      {selectMode ? (
                        <label className="grid h-14 w-12 shrink-0 cursor-pointer place-items-center">
                          <Checkbox
                            className="h-5 w-5 rounded-full"
                            aria-label={`Selecionar tarefa ${t.title}`}
                            checked={selected}
                            onCheckedChange={(checked) => toggleTaskSelection(t.id, checked === true)}
                          />
                        </label>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Concluir tarefa ${t.title}`}
                          disabled={done}
                          onClick={() => void completeTask(t.id)}
                          className="group/done grid h-14 w-12 shrink-0 place-items-center"
                        >
                          <span
                            className={`grid h-5 w-5 place-items-center rounded-full border-[1.5px] transition-colors duration-150 group-active/done:bg-primary/15 ${
                              overdue ? "border-destructive/70" : "border-muted-foreground/40"
                            }`}
                            style={t.priority === "urgent" || t.priority === "high" ? { borderColor: priorityColors[t.priority] } : undefined}
                          >
                            <Check className="h-3 w-3 text-primary opacity-0 transition-opacity group-active/done:opacity-100" />
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="min-w-0 flex-1 py-2.5 text-left"
                        onClick={() => {
                          if (selectMode) return toggleTaskSelection(t.id, !selected);
                          setEdit(t);
                          setOpen(true);
                        }}
                      >
                        <span className={`block text-[15px] font-medium leading-snug [overflow-wrap:anywhere] ${done ? "text-muted-foreground line-through" : ""}`}>
                          {t.title}
                        </span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                          {client && (
                            <>
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: client.color || "var(--primary)" }} />
                              <span className="min-w-0 truncate">{client.name}</span>
                            </>
                          )}
                          {when && (
                            <>
                              {client && <span aria-hidden className="opacity-50">·</span>}
                              <span className={`shrink-0 tabular-nums ${overdue ? "font-medium text-destructive" : ""}`}>{when}</span>
                            </>
                          )}
                          {statusColumn && (
                            <>
                              {(client || when) && <span aria-hidden className="opacity-50">·</span>}
                              <span className="min-w-0 shrink truncate">{statusColumn.name}</span>
                            </>
                          )}
                        </span>
                      </button>
                      {assignee ? (
                        <Avatar className="h-7 w-7 shrink-0" title={assignee.full_name || assignee.email || "Usuário"}>
                          <AvatarImage src={assignee.avatar_url || undefined} alt={assignee.full_name || assignee.email || "Usuário"} />
                          <AvatarFallback className="bg-accent text-[10px] font-semibold text-accent-foreground">
                            {(assignee.full_name || assignee.email || "?").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-10 border-b bg-muted/60 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
            <tr>
              <th className="w-10 px-3 py-2.5 text-center">
                <Checkbox
                  aria-label="Selecionar todas as tarefas visíveis"
                  checked={allVisibleSelected}
                  onCheckedChange={(checked) => selectAllVisibleTasks(checked === true)}
                />
              </th>
              <th className="w-[29%] px-3 py-2.5">Tarefa</th>
              <th className="w-[12%] px-3 py-2.5">Cliente</th>
              <th className="w-[13%] px-3 py-2.5">Responsável</th>
              <th className="w-[10%] px-3 py-2.5">Colaboradores</th>
              <th className="w-[11%] px-3 py-2.5">Status</th>
              <th className="w-[9%] px-3 py-2.5">Prioridade</th>
              <th className="w-[10%] px-3 py-2.5">Prazo</th>
              <th className="w-[6%] px-2 py-2.5 text-center"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center">
                  <p className="font-medium">Nenhuma tarefa encontrada</p>
                  <p className="mt-1 text-xs text-muted-foreground">Ajuste os filtros ou crie uma nova tarefa.</p>
                </td>
              </tr>
            ) : list.map((t) => {
              const client = clients.find((c) => c.id === t.client_id);
              const assignee = profiles.find((p) => p.id === t.assignee_id);
              const statusColumn = columns.find((column) => column.id === t.column_id);
              const done = t.completed_at !== null;
              const overdue = t.due_date && isPast(new Date(t.due_date)) && t.status !== "done" && !done;
              const selected = selectedTaskIds.has(t.id);
              const taskCollaborators = collaborators.filter((collaborator) => collaborator.task_id === t.id).map((collaborator) => profiles.find((profile) => profile.id === collaborator.collaborator_id)).filter(Boolean);

              return (
                <tr
                  key={t.id}
                  className={`group cursor-pointer border-t transition-colors duration-150 ${selected ? "bg-accent/50" : "hover:bg-accent/30"} ${done ? "text-muted-foreground" : ""}`}
                  onClick={() => {
                    setEdit(t);
                    setOpen(true);
                  }}
                >
                  <td className="px-3 py-2.5 text-center" onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      aria-label={`Selecionar tarefa ${t.title}`}
                      checked={selected}
                      onCheckedChange={(checked) => toggleTaskSelection(t.id, checked === true)}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`block truncate font-medium transition-colors group-hover:text-primary ${done ? "line-through decoration-muted-foreground/50" : ""}`}>{t.title}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    {client ? (
                      <span className="flex min-w-0 items-center gap-1.5 text-xs">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: client.color || "var(--primary)" }} />
                        <span className="truncate">{client.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {assignee ? (
                      <span className="flex min-w-0 items-center gap-2 text-xs">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={assignee.avatar_url || undefined} alt={assignee.full_name || assignee.email || "Usuário"} />
                          <AvatarFallback className="bg-accent text-[9px] font-semibold text-accent-foreground">
                            {(assignee.full_name || assignee.email || "?").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{assignee.full_name || assignee.email}</span>
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {taskCollaborators.length > 0 ? (
                      <div className="flex -space-x-1.5" title={taskCollaborators.map((p: any) => p.full_name || p.email).join(", ")}>
                        {taskCollaborators.slice(0, 3).map((person: any) => {
                          const name = person.full_name || person.email || "Usuário";
                          return <Avatar key={person.id} className="h-6 w-6 border-2 border-card transition-transform group-hover:translate-x-0.5"><AvatarImage src={person.avatar_url || undefined} alt={name} /><AvatarFallback className="text-[9px]">{name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>;
                        })}
                        {taskCollaborators.length > 3 ? <span className="ml-2 self-center text-[11px] text-muted-foreground">+{taskCollaborators.length - 3}</span> : null}
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {statusColumn ? (
                      <span
                        className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ background: `color-mix(in oklab, ${statusColumn.color || "var(--primary)"} 14%, transparent)` }}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: statusColumn.color || "var(--primary)" }} />
                        <span className="truncate">{statusColumn.name}</span>
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {t.priority ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: priorityColors[t.priority] }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: priorityColors[t.priority] }} />
                        {priorityLabels[t.priority]}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs tabular-nums">
                    {t.due_date ? (
                      <span className={overdue ? "inline-flex rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive" : "text-muted-foreground"}>
                        {format(new Date(t.due_date), "dd MMM yyyy", { locale: ptBR })}
                        {t.due_time ? ` · ${t.due_time.slice(0, 5)}` : ""}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-1 py-2 text-center">
                    <div className="flex justify-center gap-0.5 pointer-fine:opacity-0 transition-opacity duration-150 pointer-fine:group-hover:opacity-100 pointer-fine:focus-within:opacity-100">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 hover:text-primary"
                        title="Concluir tarefa"
                        disabled={done}
                        onClick={(event) => {
                          event.stopPropagation();
                          void completeTask(t.id);
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Mover para a lixeira"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          void moveToTrash(t);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TaskDialog open={open} onOpenChange={setOpen} task={edit} />
    </div>
  );
}
