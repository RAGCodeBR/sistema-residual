import { createFileRoute, Navigate } from "@tanstack/react-router";

// No celular a Gestão de Projetos abre direto na Lista (o Kanban é só para telas maiores).
const isPhoneWidth = () => typeof window !== "undefined" && window.innerWidth < 768;

export const Route = createFileRoute("/_app/tasks/")({
  component: () => <Navigate to={isPhoneWidth() ? "/tasks/list" : "/tasks/kanban"} replace />,
});
