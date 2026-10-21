// Datas de calendário (dias inteiros, sem hora), no formato ISO "aaaa-mm-dd".
// As tarefas são de dia inteiro: guardam-se como `date` na base de dados, não como instantes.
// O "hoje" é sempre o dia de calendário em Luanda (UTC+1, sem hora de Verão).

export const FUSO_HORARIO = 'Africa/Luanda';

const FORMATO_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_POR_DIA = 86_400_000;

// Converte "aaaa-mm-dd" num número de dias desde 1970-01-01. Recusa datas inexistentes (ex.: 2026-02-30).
function paraDias(data: string): number {
  const m = FORMATO_ISO.exec(data);
  if (!m) throw new Error(`Data inválida: ${data}`);
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(ano, mes - 1, dia);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    throw new Error(`Data inválida: ${data}`);
  }
  return ms / MS_POR_DIA;
}

function deDias(dias: number): string {
  return new Date(dias * MS_POR_DIA).toISOString().slice(0, 10);
}

export function dataValida(data: string): boolean {
  try {
    paraDias(data);
    return true;
  } catch {
    return false;
  }
}

export function somarDias(data: string, dias: number): string {
  return deDias(paraDias(data) + dias);
}

// Número de dias de `de` até `ate` (negativo se `ate` vier antes).
export function diasEntre(de: string, ate: string): number {
  return paraDias(ate) - paraDias(de);
}

// O dia de calendário em Luanda no instante dado.
export function hojeEmLuanda(agora: Date = new Date()): string {
  // en-CA formata como aaaa-mm-dd.
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_HORARIO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

// Apresentação: dd/mm/aaaa.
export function formatarData(data: string): string {
  paraDias(data);
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

// Um instante em Luanda: dd/mm/aaaa hh:mm.
export function formatarDataEHora(instante: Date): string {
  const hora = new Intl.DateTimeFormat('pt-PT', { timeZone: FUSO_HORARIO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instante);
  return `${formatarData(hojeEmLuanda(instante))} ${hora}`;
}
