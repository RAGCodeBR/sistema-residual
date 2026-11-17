import { createFileRoute, Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { KanbanSquare, List as ListIcon, Calendar as CalIcon } from "lucide-react";

import { ProcessTemplatesLibrary } from "@/components/ProcessTemplatesLibrary";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/_app/tasks")({
  component: TasksLayout,
});

function TasksLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isMobile = useIsMobile();
  const views = [
    { to: "/tasks/kanban", label: "Kanban", icon: KanbanSquare, desktopOnly: true },
    { to: "/tasks/list", label: "Lista", icon: ListIcon, desktopOnly: false },
    { to: "/tasks/calendar", label: "Calendário", icon: CalIcon, desktopOnly: false },
  ] as const;

  // No celular o Kanban não cabe: quem chegar nele vai para a Lista.
  if (isMobile && (pathname === "/tasks/kanban" || pathname.startsWith("/tasks/kanban/"))) {
    return <Navigate to="/tasks/list" search={{ task: undefined, mine: undefined }} replace />;
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur md:flex-wrap md:px-6 md:py-3">
        <span className="mr-2 hidden text-sm font-medium text-muted-foreground md:inline">Visualizar como:</span>
        <div className="flex min-w-0 flex-1 rounded-full border bg-muted/40 p-0.5 md:inline-flex md:flex-none md:rounded-lg md:p-1">
          {views.map((v) => {
            const active = pathname === v.to || pathname.startsWith(v.to + "/");
            const Icon = v.icon;
            return (
              <Link
                key={v.to}
                to={v.to}
                className={`min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-sm transition md:flex-none md:justify-start md:gap-2 md:rounded-md md:px-3 ${
                  v.desktopOnly ? "hidden md:flex" : "flex"
                } ${
                  active
                    ? "bg-background text-foreground shadow-sm max-md:font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {v.label}
              </Link>
            );
          })}
        </div>
        <ProcessTemplatesLibrary />
      </div>
      <Outlet />
    </div>
  );
}
