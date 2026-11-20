/**
 * Símbolo compacto da Residual (folhas + borboleta), para espaços onde o logo
 * completo fica ilegível: menu recolhido e cabeçalho do celular.
 * O símbolo balança de leve quando um ancestral com a classe `group` recebe hover.
 */
import jacobySymbol from "@/assets/residual-symbol.png";
import jacobySymbolDark from "@/assets/residual-symbol-dark.png";

export function JacobyMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span className={`jacoby-mark grid place-items-center ${className}`}>
      <img src={jacobySymbol} alt="Residual" className="h-full w-full object-contain dark:hidden" />
      <img src={jacobySymbolDark} alt="Residual" className="hidden h-full w-full object-contain dark:block" />
    </span>
  );
}
