import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: cors });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json({}, 405);
  const authorization = request.headers.get("Authorization") ?? "";
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
  } = await client.auth.getUser(authorization.replace(/^Bearer /i, ""));
  if (!user) return json({ error: "Sessão expirada." }, 401);
  const input = await request.json().catch(() => null);
  if (!input || typeof input.target !== "string") return json({}, 400);
  const { data: proposal } = await client
    .from("proposals")
    .select("client_phone")
    .eq("id", input.target)
    .maybeSingle();
  if (!proposal) return json({ error: "Proposta indisponível." }, 403);
  const token = Deno.env.get("RESIDUAL_WA_TOKEN"),
    sender = Deno.env.get("RESIDUAL_WA_PHONE_ID"),
    template = Deno.env.get("RESIDUAL_WA_TEMPLATE");
  if (!token || !sender || !template) return json({ configured: false });
  const digits = (proposal.client_phone ?? "").replace(/\D/g, "");
  const phone =
    !proposal.client_phone?.trim().startsWith("+") && [10, 11].includes(digits.length)
      ? "55" + digits
      : digits;
  if (!/^[1-9]\d{9,14}$/.test(phone) || input.phone !== phone)
    return json({ error: "Confira o telefone cadastrado na proposta." });
  const { data: invite, error } = await client.rpc("manage_client_signature", {
    target: input.target,
    revoke_only: false,
  });
  if (error || !invite) return json({ error: "Confira se o contrato ainda aguarda assinatura." });
  const link = "https://ragcodebr.github.io/sistema-residual/assinar#" + invite.token;
  // Approved pt_BR utility template, positional body variables: signing URL and access code.
  try {
    const response = await fetch(
      "https://graph.facebook.com/v25.0/" + encodeURIComponent(sender) + "/messages",
      {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "template",
          template: {
            name: template,
            language: { code: "pt_BR" },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: link },
                  { type: "text", text: invite.code },
                ],
              },
            ],
          },
        }),
      },
    );
    const result = await response.json();
    if (response.ok && result.messages?.[0]?.id) return json({ accepted: true });
    return json({
      error: "O WhatsApp recusou o envio. Confira o remetente e o modelo da Residual.",
    });
  } catch {
    return json({
      error: "Não foi possível confirmar o envio. Confira a conversa antes de tentar novamente.",
    });
  }
});
