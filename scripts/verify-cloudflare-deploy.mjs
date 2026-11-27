import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const base = "https://residual.verticedg.workers.dev";
const expected = JSON.parse(await readFile("dist-cloudflare/app-version.json", "utf8"));
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    const response = await fetch(`${base}/app-version.json?check=${expected.id}-${attempt}`, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "Residual-Deploy-Verification/1.0", "Cache-Control": "no-cache" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const published = await response.json();
    if (published.id === expected.id) {
      console.log("Versão publicada confere com o build:", expected.id);
      process.exit(0);
    }
  } catch (error) {
    console.log(`Verificação ${attempt + 1}: ${error.message}`);
  }
  await setTimeout(5000);
}
throw new Error("Não foi possível confirmar a versão nova no endereço definitivo.");
