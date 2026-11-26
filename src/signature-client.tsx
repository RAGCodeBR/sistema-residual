import { createRoot } from "react-dom/client";
import { ClientSigning } from "@/components/contracts/ClientSigning";
import { Toaster } from "@/components/ui/sonner";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <>
    <ClientSigning />
    <Toaster />
  </>,
);
