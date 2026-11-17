import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isPast,
  isSameMonth,
  isWeekend,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTasks, useClients, useSubtasks, useTaskCollaborators, type Task } from "@/hooks/use-data";
import { useAuth } from "@/hooks/use-auth";
import { TaskFilters, applyTaskFilters, type TaskFilterValue } from "@/components/TaskFilters";
import { TaskDialog } from "@/components/TaskDialog";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/_app/tasks/calendar")({
  component: CalendarPage,
});

function CalendarPage() {
  const { data: tasks = [] } = useTasks();
  const { data: clients = [] } = useClients();
  const { data: subtasks = [] } = useSubtasks();
  const { data: collaborators = [] } = useTaskCollaborators();
  const { user } = useAuth();
  const [cursor, setCursor] = useState(new Date());
  const [filters, setFilters] = useState<TaskFilterValue>({});
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Task | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

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

  const visible = useMemo(
    () =>
      applyTaskFilters(tasks, filters, {
        userId: user?.id ?? null,
        subtaskAssigneeTaskIds,
        collaboratorTaskIds,
        subtaskAssigneeTaskIdsByUser,
      }),
    [tasks, filters, user?.id, subtaskAssigneeTaskIds, collaboratorTaskIds, subtaskAssigneeTaskIdsByUser],
  );

  const subtaskDueDatesByTask = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const st of subtasks) {
      if (!st.task_id || !st.due_date) continue;
      const list = map.get(st.task_id) ?? [];
      list.push(st.due_date);
      map.set(st.task_id, list);
    }
    return map;
  }, [subtasks]);

  const dayTasks = (day: Date) =>
    visible.filter((t) => {
      if (t.due_date && isSameDay(new Date(t.due_date), day)) return true;
      return (subtaskDueDatesByTask.get(t.id) ?? []).some((due) => isSameDay(new Date(due), day));
    });

  const monthTaskCount = days
    .filter((day) => isSameMonth(day, cursor))
    .reduce((sum, day) => sum + dayTasks(day).length, 0);

  if (isMobile) {
    return (
      <>
        <MobileWeekCalendar
          tasks={visible}
          clients={clients}
          subtaskDueDatesByTask={subtaskDueDatesByTask}
          filters={filters}
          onFiltersChange={setFilters}
          onOpenTask={(t) => {
            setEdit(t);
            setOpen(true);
          }}
          onNewTask={() => {
            setEdit(null);
            setOpen(true);
          }}
        />
        <TaskDialog open={open} onOpenChange={setOpen} task={edit} />
      </>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border bg-card p-0.5 shadow-sm">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCursor(subMonths(cursor, 1))} title="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={() => setCursor(new Date())}>
              Hoje
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCursor(addMonths(cursor, 1))} title="Próximo mês">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div>
            <h2 key={format(cursor, "yyyy-MM")} className="text-xl font-bold capitalize leading-tight animate-in fade-in slide-in-from-left-1 duration-200">
              {format(cursor, "MMMM yyyy", { locale: ptBR })}
            </h2>
            <p className="text-xs text-muted-foreground">
              <span className="tabular-nums">{monthTaskCount}</span> {monthTaskCount === 1 ? "tarefa no mês" : "tarefas no mês"}
            </p>
          </div>
        </div>
        <Button
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Tarefa
        </Button>
      </header>
      <TaskFilters filters={filters} onChange={setFilters} />

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="grid grid-cols-7 border-b bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
            <div key={d} className="px-3 py-2">
              {d}
            </div>
          ))}
        </div>
        <div key={format(cursor, "yyyy-MM")} className="grid grid-cols-7 animate-in fade-in duration-300">
          {days.map((day) => {
            const dayKey = day.toISOString();
            const inMonth = isSameMonth(day, cursor);
            const today = isSameDay(day, new Date());
            const ts = dayTasks(day);
            const expanded = expandedDay === dayKey;
            const shown = expanded ? ts : ts.slice(0, 3);
            return (
              <div
                key={dayKey}
                className={`group min-h-32 border-b border-r p-1.5 transition-colors duration-150 [&:nth-child(7n)]:border-r-0 ${
                  today ? "bg-accent/40" : inMonth ? (isWeekend(day) ? "bg-muted/25 hover:bg-accent/20" : "hover:bg-accent/20") : "bg-muted/40 text-muted-foreground"
                }`}
              >
                <div className="mb-1 flex items-center justify-between px-0.5">
                  <span
                    className={`inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs tabular-nums ${
                      today ? "bg-primary font-semibold text-primary-foreground shadow-sm" : inMonth ? "font-medium" : ""
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  {ts.length > 0 && (
                    <span className="text-[10px] tabular-nums text-muted-foreground pointer-fine:opacity-0 transition-opacity pointer-fine:group-hover:opacity-100">
                      {ts.length}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {shown.map((t) => {
                    const client = clients.find((c) => c.id === t.client_id);
                    const color = client?.color || t.color || "var(--primary)";
                    const done = t.completed_at !== null;
                    const late = !done && t.due_date && isPast(new Date(t.due_date)) && !isSameDay(new Date(t.due_date), new Date());
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          setEdit(t);
                          setOpen(true);
                        }}
                        title={t.title}
                        className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] font-medium transition-all duration-150 hover:-translate-y-px hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          done ? "text-muted-foreground line-through" : "text-foreground"
                        }`}
                        style={{ background: `color-mix(in oklab, ${color} 13%, transparent)` }}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: late ? "var(--destructive)" : color }} />
                        <span className="truncate">
                          {t.due_time && <span className="tabular-nums text-muted-foreground">{t.due_time.slice(0, 5)} </span>}
                          {t.title}
                        </span>
                      </button>
                    );
                  })}
                  {ts.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setExpandedDay(expanded ? null : dayKey)}
                      className="w-full rounded-md px-1.5 py-0.5 text-left text-[10px] font-medium text-primary transition-colors hover:bg-accent/60"
                    >
                      {expanded ? "Mostrar menos" : `+${ts.length - 3} mais`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <TaskDialog open={open} onOpenChange={setOpen} task={edit} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Celular: agenda semanal                                             */
/* ------------------------------------------------------------------ */

type ClientLite = { id: string; name: string; color: string | null };

const WEEKDAY_INITIALS = ["S", "T", "Q", "Q", "S", "S", "D"];
const WEEKDAY_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function MobileWeekCalendar({
  tasks,
  clients,
  subtaskDueDatesByTask,
  filters,
  onFiltersChange,
  onOpenTask,
  onNewTask,
}: {
  tasks: Task[];
  clients: ClientLite[];
  subtaskDueDatesByTask: Map<string, string[]>;
  filters: TaskFilterValue;
  onFiltersChange: (f: TaskFilterValue) => void;
  onOpenTask: (t: Task) => void;
  onNewTask: () => void;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selected, setSelected] = useState<Date>(() => new Date());
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = days[6];
  const today = new Date();

  const tasksByDay = useMemo(
    () =>
      days.map((day) =>
        tasks
          .map((t) => {
            const ownDue = !!t.due_date && isSameDay(new Date(t.due_date), day);
            const stepDue = !ownDue && (subtaskDueDatesByTask.get(t.id) ?? []).some((due) => isSameDay(new Date(due), day));
            return ownDue || stepDue ? { task: t, stepOnly: stepDue } : null;
          })
          .filter((x): x is { task: Task; stepOnly: boolean } => x !== null)
          .sort((a, b) => (a.task.due_time ?? "99").localeCompare(b.task.due_time ?? "99")),
      ),
    [days, tasks, subtaskDueDatesByTask],
  );
  const weekCount = tasksByDay.reduce((sum, list) => sum + list.length, 0);

  // Ao trocar de semana, seleciona hoje (se estiver nela) ou a segunda-feira.
  const goToWeek = (start: Date) => {
    setWeekStart(start);
    const inWeek = isSameDay(startOfWeek(today, { weekStartsOn: 1 }), start);
    setSelected(inWeek ? today : start);
  };

  const selectDay = (day: Date) => {
    setSelected(day);
    sectionRefs.current[day.toDateString()]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };


  const sameMonth = isSameMonth(weekStart, weekEnd);
  const rangeLabel = sameMonth
    ? `${format(weekStart, "d")} – ${format(weekEnd, "d 'de' MMMM", { locale: ptBR })}`
    : `${format(weekStart, "d MMM", { locale: ptBR })} – ${format(weekEnd, "d MMM", { locale: ptBR })}`;

  return (
    <div className="space-y-3 p-3 pb-24">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 key={weekStart.toISOString()} className="truncate text-lg font-bold leading-tight animate-in fade-in duration-200">
            {rangeLabel}
          </h2>
          <p className="text-xs text-muted-foreground">
            <span className="tabular-nums">{weekCount}</span> {weekCount === 1 ? "tarefa na semana" : "tarefas na semana"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="flex items-center rounded-full border bg-card p-0.5">
            <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full" aria-label="Semana anterior" onClick={() => goToWeek(subWeeks(weekStart, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-9 rounded-full px-2.5 text-xs" onClick={() => goToWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
              Hoje
            </Button>
            <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full" aria-label="Próxima semana" onClick={() => goToWeek(addWeeks(weekStart, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button size="icon" className="h-10 w-10 rounded-full" aria-label="Nova tarefa" onClick={onNewTask}>
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <TaskFilters filters={filters} onChange={onFiltersChange} />

      {/* Faixa da semana: toque para ir ao dia, deslize para trocar de semana. */}
      <div
        className="grid touch-pan-y grid-cols-7 gap-1 rounded-2xl border bg-card p-1.5"
        onTouchStart={(e) => {
          touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start) return;
          const dx = e.changedTouches[0].clientX - start.x;
          const dy = e.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          goToWeek(dx < 0 ? addWeeks(weekStart, 1) : subWeeks(weekStart, 1));
        }}
      >
        {days.map((day, i) => {
          const isSel = isSameDay(day, selected);
          const isTod = isSameDay(day, today);
          const count = tasksByDay[i].length;
          const hasLate = tasksByDay[i].some(({ task }) => task.completed_at === null && isPast(day) && !isTod);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => selectDay(day)}
              aria-label={`${format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}: ${count} ${count === 1 ? "tarefa" : "tarefas"}`}
              aria-pressed={isSel}
              className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl py-1.5 transition-colors active:bg-accent/60"
            >
              <span className={`text-[10px] font-semibold uppercase ${isTod ? "text-primary" : "text-muted-foreground"}`}>
                {WEEKDAY_INITIALS[i]}
              </span>
              <span
                className={`grid h-8 w-8 place-items-center rounded-full text-sm font-semibold tabular-nums transition-colors duration-200 ${
                  isSel ? "bg-primary text-primary-foreground shadow-sm" : isTod ? "text-primary ring-1 ring-primary/40" : ""
                }`}
              >
                {format(day, "d")}
              </span>
              <span className="flex h-1.5 items-center gap-0.5">
                {count > 0 &&
                  Array.from({ length: Math.min(count, 3) }, (_, k) => (
                    <span key={k} className={`h-1 w-1 rounded-full ${hasLate ? "bg-destructive" : "bg-primary/70"}`} />
                  ))}
              </span>
            </button>
          );
        })}
      </div>

      {/* Agenda: os 7 dias empilhados. */}
      <div key={weekStart.toISOString()} className="overflow-hidden rounded-2xl border bg-card animate-in fade-in duration-200">
        {days.map((day, i) => {
          const list = tasksByDay[i];
          const isTod = isSameDay(day, today);
          const isSel = isSameDay(day, selected);
          return (
            <section
              key={day.toISOString()}
              ref={(el) => {
                sectionRefs.current[day.toDateString()] = el;
              }}
              className={`flex scroll-mt-28 gap-3 border-b px-3 py-3 transition-colors duration-300 last:border-b-0 ${isSel ? "bg-accent/30" : ""}`}
            >
              <button type="button" onClick={() => setSelected(day)} className="w-10 shrink-0 pt-0.5 text-center">
                <span className={`block text-[10px] font-semibold uppercase ${isTod ? "text-primary" : "text-muted-foreground"}`}>
                  {WEEKDAY_SHORT[i]}
                </span>
                <span className={`block text-xl font-bold leading-tight tabular-nums ${isTod ? "text-primary" : isWeekend(day) ? "text-muted-foreground" : ""}`}>
                  {format(day, "d")}
                </span>
              </button>
              <div className="min-w-0 flex-1 space-y-1.5">
                {list.length === 0 ? (
                  <p className="pt-2.5 text-xs text-muted-foreground/80">Sem tarefas</p>
                ) : (
                  list.map(({ task: t, stepOnly }) => {
                    const client = clients.find((c) => c.id === t.client_id);
                    const color = client?.color || t.color || "var(--primary)";
                    const done = t.completed_at !== null;
                    const late = !done && !stepOnly && !!t.due_date && isPast(new Date(t.due_date)) && !isSameDay(new Date(t.due_date), today);
                    const meta = [
                      !stepOnly && t.due_time ? t.due_time.slice(0, 5) : null,
                      stepOnly ? "Etapa com prazo" : null,
                      client?.name,
                    ].filter(Boolean);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onOpenTask(t)}
                        className="flex w-full min-h-11 items-start gap-2.5 rounded-xl px-3 py-2 text-left transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        style={{ background: `color-mix(in oklab, ${color} 11%, transparent)` }}
                      >
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: late ? "var(--destructive)" : color }} />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm font-medium leading-snug [overflow-wrap:anywhere] ${done ? "text-muted-foreground line-through" : ""}`}>
                            {t.title}
                          </span>
                          {(meta.length > 0 || late) && (
                            <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                              {late && <span className="shrink-0 font-semibold text-destructive">Atrasada</span>}
                              {late && meta.length > 0 && <span aria-hidden>·</span>}
                              <span className="truncate tabular-nums">{meta.join(" · ")}</span>
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
