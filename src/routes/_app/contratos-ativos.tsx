import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/contratos-ativos")({
  beforeLoad: () => {
    throw redirect({ to: "/contratos", replace: true });
  },
});
