import { useQuery } from "@tanstack/react-query";
import { table } from "@/lib/company";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commercialRpc } from "@/lib/commercial-clients";

export function ClientSignatureInvite({ id }: { id: string }) {
  const [invite, setInvite] = useState<{ link: string; code: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const contact = useQuery({
    queryKey: ["contract-recipient", id],
    queryFn: async () => {
      const { data, error } = await table("proposals").select("client_phone").eq("id", id).single();
      if (error) throw error;
      return String(data.client_phone ?? "").trim();
    },
  });
  const digits = (contact.data ?? "").replace(/\D/g, "");
  const phone =
    !contact.data?.startsWith("+") && [10, 11].includes(digits.length) ? "55" + digits : digits;
  async function send() {
    if (
      !window.confirm(
        "Preparar o envio do contrato para " +
          contact.data +
          "? Um novo convite substitui o anterior.",
      )
    )
      return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-contract-whatsapp", {
        body: { target: id, phone },
      });
      if (error) throw new Error("Falha ao consultar o envio por WhatsApp.");
      if (data?.error) throw new Error(data.error);
      if (data?.accepted) {
        setInvite(null);
        setManual(false);
        toast.success("Convite aceito pelo WhatsApp para envio.");
        return;
      }
      if (data?.configured !== false) throw new Error("Envio não confirmado.");
      const fresh = await commercialRpc<{ token: string; code: string }>(
        "manage_client_signature",
        { target: id, revoke_only: false },
      );
      setInvite({
        link: new URL(import.meta.env.BASE_URL + "assinar#" + fresh.token, location.origin).href,
        code: fresh.code,
      });
      setManual(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function change(revoke: boolean) {
    if (
      !window.confirm(
        revoke
          ? "Invalidar o link de assinatura deste contrato?"
          : "Gerar um link válido por sete dias? Qualquer link anterior deste contrato será invalidado.",
      )
    )
      return;
    setBusy(true);
    try {
      const data = await commercialRpc<{ token: string; code: string }>("manage_client_signature", {
        target: id,
        revoke_only: revoke,
      });
      setManual(false);
      setInvite(
        revoke
          ? null
          : {
              code: data.code,
              link: new URL(import.meta.env.BASE_URL + "assinar#" + data.token, location.origin)
                .href,
            },
      );
      toast.success(revoke ? "Link revogado." : "Link de assinatura criado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-sm">
        WhatsApp do cliente ·{" "}
        {contact.isPending ? "Carregando…" : contact.data || "Informe o telefone na proposta"}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !/^[1-9]\d{9,14}$/.test(phone)} onClick={send}>
          Enviar pelo WhatsApp
        </Button>
        <Button size="sm" disabled={busy} onClick={() => change(false)}>
          Gerar link para o cliente
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => change(true)}>
          Revogar link
        </Button>
      </div>
      {invite && (
        <div className="grid gap-2 rounded-lg border bg-background p-3 text-sm">
          {manual && (
            <>
              <p>Confirme o envio da mensagem na conversa do cliente.</p>
              <Button asChild>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href={
                    "https://wa.me/" +
                    phone +
                    "?text=" +
                    encodeURIComponent(
                      "Olá! A Residual encaminha o contrato para sua assinatura. Acesse " +
                        invite.link +
                        " e informe o código " +
                        invite.code +
                        ". O convite vale por 7 dias.",
                    )
                  }
                >
                  Abrir conversa no WhatsApp
                </a>
              </Button>
            </>
          )}
          <label>
            Link de assinatura
            <Input readOnly value={invite.link} onFocus={(e) => e.target.select()} />
          </label>
          <label>
            Código de acesso
            <Input readOnly value={invite.code} onFocus={(e) => e.target.select()} />
          </label>
          <p>
            O acesso vale por sete dias. Alterar o texto ou o número do contrato invalida o link.
          </p>
        </div>
      )}
    </div>
  );
}
