import { createFileRoute } from "@tanstack/react-router";
import { ClientSigning } from "@/components/contracts/ClientSigning";

export const Route = createFileRoute("/assinar")({ component: ClientSigning });
