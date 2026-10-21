// Filtros e calendário das tarefas de um projecto. Funções puras, usadas pelos ecrãs e testadas à parte.
import { diasEntre, somarDias } from './datas.js';
import type { EstadoTarefa, TarefaProjecto } from './projectos.js';

export interface Filtros {
  fase?: string;
  categoria?: string;
  papel?: string;
  estado?: EstadoTarefa;
  // "eu" = atribuídas a quem está a ver; "ninguem" = sem responsável; ou o ID de uma pessoa.
  responsavel?: string;
  soCriticas?: boolean;
  soEmAtraso?: boolean;
}

export const RESPONSAVEL_EU = 'eu';
export const RESPONSAVEL_NINGUEM = 'ninguem';

export function filtrarTarefas(tarefas: TarefaProjecto[], filtros: Filtros, utilizadorId: string): TarefaProjecto[] {
  const responsavel = filtros.responsavel === RESPONSAVEL_EU ? utilizadorId : filtros.responsavel;
  return tarefas.filter(
    (t) =>
      (!filtros.fase || t.fase === filtros.fase) &&
      (!filtros.categoria || t.categoria === filtros.categoria) &&
      (!filtros.papel || t.papel === filtros.papel) &&
      (!filtros.estado || t.estado === filtros.estado) &&
      (!responsavel || (responsavel === RESPONSAVEL_NINGUEM ? t.responsavel === null : t.responsavel?.id === responsavel)) &&
      (!filtros.soCriticas || t.critica) &&
      (!filtros.soEmAtraso || t.emAtraso),
  );
}

export const filtrosActivos = (filtros: Filtros) => Object.values(filtros).filter((v) => v !== undefined && v !== '' && v !== false).length;

// Valores distintos, pela ordem em que aparecem (a ordem do template).
export const valoresDistintos = (tarefas: TarefaProjecto[], campo: 'fase' | 'categoria' | 'papel') => [...new Set(tarefas.map((t) => t[campo]))];

// Calendário: o mês como "aaaa-mm".
export const mesDe = (data: string) => data.slice(0, 7);

export function somarMeses(mes: string, n: number): string {
  const [ano, m] = mes.split('-').map(Number) as [number, number];
  const total = ano * 12 + (m - 1) + n;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}

// Dia da semana com segunda-feira = 0 (como nos calendários portugueses).
export function diaDaSemana(data: string): number {
  // 1970-01-05 foi uma segunda-feira.
  return (((diasEntre('1970-01-05', data) % 7) + 7) % 7);
}

// Semanas do mês (segunda a domingo), com null nos dias de fora do mês.
export function semanasDoMes(mes: string): (string | null)[][] {
  const primeiro = `${mes}-01`;
  const ultimo = somarDias(`${somarMeses(mes, 1)}-01`, -1);
  const dias: (string | null)[] = Array.from({ length: diaDaSemana(primeiro) }, () => null);
  for (let d = primeiro; d <= ultimo; d = somarDias(d, 1)) dias.push(d);
  while (dias.length % 7 !== 0) dias.push(null);
  return Array.from({ length: dias.length / 7 }, (_, i) => dias.slice(i * 7, i * 7 + 7));
}

// Tarefas a decorrer nesse dia (entre o início e o fim, inclusive).
export const tarefasNoDia = (tarefas: TarefaProjecto[], dia: string) => tarefas.filter((t) => t.inicio <= dia && dia <= t.fim);

// Meses entre a primeira e a última data das tarefas (e o dia do evento).
export function intervaloDeMeses(tarefas: TarefaProjecto[], dataEvento: string): { primeiro: string; ultimo: string } {
  const datas = [dataEvento, ...tarefas.flatMap((t) => [t.inicio, t.fim])].sort();
  return { primeiro: mesDe(datas[0]!), ultimo: mesDe(datas.at(-1)!) };
}
