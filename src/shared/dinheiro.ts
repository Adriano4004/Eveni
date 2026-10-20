// Valores em Kwanza, guardados em cêntimos (inteiros). Formato pt-PT: espaço como separador de milhares,
// vírgula decimal, duas casas: 5 000 000,00 Kz.
// O espaço é inseparável (U+00A0), para o valor não se partir entre linhas.
const ESPACO = ' ';

export function formatarKz(centimos: number): string {
  if (!Number.isSafeInteger(centimos)) throw new Error(`Valor inválido: ${centimos}`);
  const sinal = centimos < 0 ? '-' : '';
  const absoluto = Math.abs(centimos);
  const inteiros = String(Math.floor(absoluto / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ESPACO);
  const decimais = String(absoluto % 100).padStart(2, '0');
  return `${sinal}${inteiros},${decimais}${ESPACO}Kz`;
}
