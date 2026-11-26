import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@supabase/supabase-js";
import { contractPdf, type SignatureReceipt } from "@/lib/residual-contract";
import { usePdfPreview } from "@/components/PdfPreviewDialog";
import logo from "@/assets/residual-logo-transparent.png";

const signingApi = () =>
  createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storageKey: "residual-signature-public",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
type DocumentData = {
  number: string;
  body: string;
  hash: string;
  consent: string;
  receipt: SignatureReceipt | null;
};
export function ClientSigning() {
  const [api] = useState(signingApi);
  const token = typeof window === "undefined" ? "" : window.location.hash.slice(1);
  const [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [doc, setDoc] = useState<DocumentData | null>(null);
  const { openPdfPreview, pdfPreviewDialog } = usePdfPreview();
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const { data, error: failure } = await api.rpc("client_contract_session", {
        access_token: token,
        access_code: code.trim().toUpperCase(),
        signed_name: doc ? name.trim() : null,
        accepted_hash: doc && consent ? doc.hash : null,
      });
      if (failure) throw new Error(failure.message);
      setDoc(data as DocumentData);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function preview() {
    if (!doc) return;
    try {
      const blob = await contractPdf(doc.number, doc.body, doc.receipt);
      openPdfPreview({
        title: "Contrato " + doc.number,
        fileName: "Contrato " + doc.number.replaceAll("/", "-") + ".pdf",
        url: URL.createObjectURL(blob),
        revokeOnClose: true,
      });
    } catch {
      setError("Não foi possível abrir o PDF.");
    }
  }
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-5 sm:p-10">
      <img src={logo} alt="Residual" className="h-16" />
      <h1 className="text-2xl font-bold">{doc ? "Contrato " + doc.number : "Assinar contrato"}</h1>
      {doc && (
        <>
          <Button variant="outline" onClick={preview}>
            Visualizar PDF
          </Button>
          <div
            tabIndex={0}
            aria-label="Texto do contrato"
            className="max-h-[48dvh] overflow-auto whitespace-pre-wrap rounded-xl border bg-card p-4 text-sm leading-relaxed"
          >
            {doc.body}
          </div>
        </>
      )}
      {!/^[a-f0-9]{32}$/.test(token) ? (
        <p role="alert">
          Este link está incompleto. Abra o link inteiro da mensagem de assinatura da Residual.
        </p>
      ) : doc?.receipt ? (
        <p role="status" className="font-semibold text-primary">
          Assinatura de {doc.receipt.signer} confirmada. A Residual foi notificada.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="grid gap-4"
        >
          {doc ? (
            <>
              <label>
                Nome completo do representante
                <Input
                  required
                  minLength={3}
                  maxLength={180}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  required
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                {doc.consent}
              </label>
            </>
          ) : (
            <label>
              Código de acesso enviado pela Residual
              <Input
                required
                autoComplete="one-time-code"
                maxLength={12}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </label>
          )}
          <Button
            disabled={
              busy || (doc ? !consent || name.trim().length < 3 : code.trim().length !== 12)
            }
          >
            {doc ? "Confirmar assinatura" : "Abrir contrato"}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {pdfPreviewDialog}
    </main>
  );
}
