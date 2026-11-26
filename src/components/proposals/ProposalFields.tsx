/**
 * Campos do editor de propostas: preço em reais, tabela de preços (resíduos)
 * e escopo da assessoria.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { UNITS, moneyInput, parseMoney, uid, type PriceGroup, type PriceItem, type ScopeItem } from "@/lib/proposals";

const cnpjCharacters = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");

function formatCnpj(text: string) {
  const chars = cnpjCharacters(text).slice(0, 14);
  return chars.slice(0, 2)
    + (chars.length > 2 ? "." + chars.slice(2, 5) : "")
    + (chars.length > 5 ? "." + chars.slice(5, 8) : "")
    + (chars.length > 8 ? "/" + chars.slice(8, 12) : "")
    + (chars.length > 12 ? "-" + chars.slice(12) : "");
}

export function CnpjInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Input aria-label="CNPJ" placeholder="00.000.000/0000-00" value={formatCnpj(value)} autoCapitalize="characters" spellCheck={false}
      onChange={(event) => {
        const input = event.currentTarget;
        const raw = input.value;
        const count = cnpjCharacters(raw.slice(0, input.selectionStart ?? raw.length)).length;
        const formatted = formatCnpj(raw);
        let caret = formatCnpj(cnpjCharacters(raw).slice(0, count)).length;
        if ((event.nativeEvent as InputEvent).inputType === "deleteContentForward" && /[./-]/.test(formatted.charAt(caret))) caret++;
        input.value = formatted;
        input.setSelectionRange(caret, caret);
        onChange(formatted);
      }}
    />
  );
}

export function MoneyInput({ value, onChange, placeholder = "0,00", className = "", ariaLabel }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string; className?: string; ariaLabel?: string }) {
  const [text, setText] = useState(moneyInput(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(moneyInput(value));
  }, [value]);
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
      <Input
        inputMode="decimal"
        aria-label={ariaLabel}
        className="pl-9 text-right tabular-nums"
        value={text}
        placeholder={placeholder}
        onFocus={() => (focused.current = true)}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseMoney(e.target.value));
        }}
        onBlur={() => {
          focused.current = false;
          setText(moneyInput(parseMoney(text)));
        }}
      />
    </div>
  );
}

export function PriceGroupsEditor({ groups, onChange, disabled }: { groups: PriceGroup[]; onChange: (g: PriceGroup[]) => void; disabled?: boolean }) {
  const setGroup = (id: string, patch: Partial<PriceGroup>) => onChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const setItem = (g: PriceGroup, itemId: string, patch: Partial<PriceItem>) => setGroup(g.id, { items: g.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) });
  const move = (g: PriceGroup, index: number, delta: number) => {
    const items = [...g.items];
    const [it] = items.splice(index, 1);
    items.splice(index + delta, 0, it);
    setGroup(g.id, { items });
  };

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.id} className="overflow-hidden rounded-xl border">
          <div className="flex items-center gap-2 border-b bg-primary/5 px-3 py-2">
            <Input value={g.title} disabled={disabled} onChange={(e) => setGroup(g.id, { title: e.target.value })} className="h-9 border-transparent bg-transparent font-semibold text-primary shadow-none focus-visible:bg-background" aria-label="Nome do grupo" placeholder="Ex.: Resíduo Classe I" />
            <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-muted-foreground" disabled={disabled} onClick={() => confirm(`Remover o grupo "${g.title || "sem nome"}" e seus itens?`) && onChange(groups.filter((x) => x.id !== g.id))} aria-label="Remover grupo" title="Remover grupo">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="hidden grid-cols-[1fr_8.5rem_7.5rem_10rem_2.5rem] gap-2 px-3 pt-2 text-xs font-medium text-muted-foreground xl:grid">
            <span>Item</span><span className="text-right">Valor</span><span>Por</span><span>Faturamento mínimo</span><span />
          </div>
          <ul className="divide-y xl:divide-y-0">
            {g.items.map((it, index) => (
              <li key={it.id} className="grid grid-cols-2 gap-2 p-3 xl:grid-cols-[1fr_8.5rem_7.5rem_10rem_2.5rem] xl:items-center xl:py-1.5">
                <Input className="col-span-2 xl:col-span-1" value={it.description} disabled={disabled} onChange={(e) => setItem(g, it.id, { description: e.target.value })} placeholder="Ex.: Madeira, Frete, Destinação" aria-label="Item" />
                <MoneyInput value={it.price} onChange={(price) => setItem(g, it.id, { price })} placeholder="A combinar" ariaLabel="Valor" />
                <Select value={it.unit} disabled={disabled} onValueChange={(unit) => setItem(g, it.id, { unit })}>
                  <SelectTrigger aria-label="Unidade"><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>por {u}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="col-span-2 sm:col-span-1" value={it.minimum} disabled={disabled} onChange={(e) => setItem(g, it.id, { minimum: e.target.value })} placeholder="Ex.: 1 tonelada (opcional)" aria-label="Faturamento mínimo" />
                <div className="col-span-2 flex items-center justify-end gap-0.5 sm:col-span-1">
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 xl:hidden" disabled={disabled || index === 0} onClick={() => move(g, index, -1)} aria-label="Subir"><ArrowUp className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 xl:hidden" disabled={disabled || index === g.items.length - 1} onClick={() => move(g, index, 1)} aria-label="Descer"><ArrowDown className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" disabled={disabled} onClick={() => setGroup(g.id, { items: g.items.filter((x) => x.id !== it.id) })} aria-label="Remover item" title="Remover item"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 border-t px-3 py-2">
            <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setGroup(g.id, { items: [...g.items, { id: uid(), description: "", price: null, unit: "kg", minimum: "" }] })}>
              <Plus className="h-4 w-4" />Item
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setGroup(g.id, { items: [...g.items, { id: uid(), description: "Frete", price: null, unit: "viagem", minimum: "" }] })}>
              <Plus className="h-4 w-4" />Frete
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange([...groups, { id: uid(), title: "", items: [{ id: uid(), description: "", price: null, unit: "kg", minimum: "" }] }])}>
        <Plus className="h-4 w-4" />Grupo de resíduo
      </Button>
    </div>
  );
}

export function ScopeEditor({ scope, onChange, disabled }: { scope: ScopeItem[]; onChange: (s: ScopeItem[]) => void; disabled?: boolean }) {
  const set = (id: string, patch: Partial<ScopeItem>) => onChange(scope.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-xl border">
        {scope.map((s) => (
          <li key={s.id} className={`p-3 ${s.enabled ? "" : "bg-muted/30"}`}>
            <div className="flex items-start gap-3">
              <Checkbox checked={s.enabled} disabled={disabled} onCheckedChange={(v) => set(s.id, { enabled: v === true })} className="mt-1" aria-label={`Incluir ${s.title}`} />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
                <span className={`block font-medium ${s.enabled ? "" : "text-muted-foreground line-through"}`}>{s.title || "Sem título"}</span>
                {open !== s.id && <span className="line-clamp-1 text-sm text-muted-foreground">{s.text}</span>}
              </button>
              <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 text-xs" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Fechar" : "Editar"}</Button>
            </div>
            {open === s.id && (
              <div className="mt-3 space-y-2 pl-7">
                <Input value={s.title} disabled={disabled} onChange={(e) => set(s.id, { title: e.target.value })} aria-label="Título do item" />
                <Textarea rows={4} value={s.text} disabled={disabled} onChange={(e) => set(s.id, { text: e.target.value })} aria-label="Descrição do item" />
                <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={disabled} onClick={() => onChange(scope.filter((x) => x.id !== s.id))}><Trash2 className="h-4 w-4" />Remover item</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => {
        const id = uid();
        onChange([...scope, { id, title: "Novo serviço", text: "", enabled: true }]);
        setOpen(id);
      }}>
        <Plus className="h-4 w-4" />Item de escopo
      </Button>
    </div>
  );
}
