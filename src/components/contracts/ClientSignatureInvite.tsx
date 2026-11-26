import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commercialRpc } from "@/lib/commercial-clients";

export function ClientSignatureInvite({ id }: { id: string }) {
  const [invite, setInvite] = useState<{ link: string; code: string } | null>(null);
  const [busy, setBusy] = useState(false);
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
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => change(false)}>
          Gerar link para o cliente
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => change(true)}>
          Revogar link
        </Button>
      </div>
      {invite && (
        <div className="grid gap-2 rounded-lg border bg-background p-3 text-sm">
          <label>
            Link de assinatura
            <Input readOnly value={invite.link} onFocus={(e) => e.target.select()} />
          </label>
          <label>
            Código de acesso
            <Input readOnly value={invite.code} onFocus={(e) => e.target.select()} />
          </label>
          <p>
            Envie o link ao representante e o código por outro canal. O acesso vale por sete dias.
            Alterar o texto ou o número do contrato invalida o link.
          </p>
        </div>
      )}
    </div>
  );
}
