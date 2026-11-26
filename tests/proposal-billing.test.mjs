import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../src/lib/proposal-billing.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { billingLines, executionDays, minimumUnits } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
const waste = { description: "Material", unit: "kg", price: 0.6, minimum: "1 tonelada" };
const freight = { description: "Frete", unit: "viagem", price: 650 };
test("calcula mínimos por material e aplica o frete uma vez por alternativa", () => {
  const lines = billingLines({ items: [waste, { ...waste, price: 1 }, freight] });
  assert.deepEqual(
    lines.map((l) => l.total),
    [1250, 1650],
  );
  assert.equal(minimumUnits({ ...waste, minimum: "1.500 kg" }), 1500);
  assert.equal(minimumUnits({ ...waste, minimum: "", unit: "tonelada" }), 1);
  assert.equal(minimumUnits({ ...waste, minimum: "1,5 toneladas", unit: "m³" }), null);
  assert.equal(billingLines({ items: [waste, freight, freight] })[0].total, null);
  assert.equal(
    billingLines({ items: [waste, { ...freight, description: "Rota A", freight: true }] })[0].total,
    1250,
  );
});
test("respeita prazo contratado e sinaliza condições livres sem vencimento inequívoco", () => {
  assert.equal(executionDays({ due_days: 10 }), 10);
  assert.equal(
    executionDays({ due_days: 10, payment_terms: "15 dias após a execução do serviço." }),
    15,
  );
  assert.equal(executionDays({ due_days: 10, payment_terms: "10 dias úteis após emissão" }), null);
});
