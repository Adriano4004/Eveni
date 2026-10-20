// Motor de datas: transforma os offsets de um template (D-21, D0, D+7) em datas reais
// a partir da data do evento (CLAUDE.md, secção 9). Funções puras: não lêem o relógio
// nem a base de dados; quem chama passa o "hoje" (ver hojeEmLuanda).
//
// Regra de compressão:
// - Se faltam menos dias até ao evento do que o offset mais antigo do template, as tarefas
//   NÃO críticas anteriores ao evento são comprimidas proporcionalmente, de forma a caberem
//   entre hoje e o dia do evento.
// - As tarefas críticas nunca se comprimem: mantêm o offset. As que, por isso, deveriam ter
//   começado antes de hoje são devolvidas em `avisos`, para mostrar no momento de criar o projecto.
// - As tarefas no dia do evento ou depois dele (D0, D+7) não mudam.
import { diasEntre, somarDias } from './datas.js';
import type { TarefaTemplate } from './templates.js';

export interface TarefaMaterializada {
  id: string;
  inicio: string;
  fim: string;
  // A tarefa foi encurtada/antecipada pela regra de compressão.
  comprimida: boolean;
}

export interface AvisoPrazo {
  id: string;
  titulo: string;
  // Data em que a tarefa crítica deveria ter começado (antes de hoje).
  inicio: string;
  fim: string;
  // Quantos dias de antecedência faltam.
  diasEmFalta: number;
}

export interface Materializacao {
  tarefas: TarefaMaterializada[];
  // Dias entre hoje e o evento (0 = o evento é hoje).
  diasDisponiveis: number;
  // Antecedência que o template pede: o offset mais antigo, em dias (21 no T01).
  diasNecessarios: number;
  comprimido: boolean;
  // Tarefas críticas sem tempo suficiente, pela ordem do template.
  avisos: AvisoPrazo[];
}

export class EventoNoPassado extends Error {
  constructor() {
    super('A data do evento já passou.');
  }
}

type TarefaBase = Pick<TarefaTemplate, 'id' | 'titulo' | 'inicio' | 'fim' | 'critica'>;

export function materializar(tarefas: readonly TarefaBase[], dataEvento: string, hoje: string): Materializacao {
  const diasDisponiveis = diasEntre(hoje, dataEvento);
  if (diasDisponiveis < 0) throw new EventoNoPassado();

  const diasNecessarios = Math.max(0, ...tarefas.map((t) => -t.inicio));
  const comprimido = diasDisponiveis < diasNecessarios;

  // Só offsets antes do evento se comprimem, arredondados ao dia mais próximo. O valor exacto nunca
  // é anterior a -diasDisponiveis (hoje), que é inteiro, logo o arredondado também não. `|| 0` evita o -0.
  const comprimir = (offset: number) =>
    offset >= 0 ? offset : Math.round((offset * diasDisponiveis) / diasNecessarios) || 0;

  const avisos: AvisoPrazo[] = [];
  const materializadas = tarefas.map((t): TarefaMaterializada => {
    const aComprimir = comprimido && !t.critica && t.inicio < 0;
    const inicio = somarDias(dataEvento, aComprimir ? comprimir(t.inicio) : t.inicio);
    const fim = somarDias(dataEvento, aComprimir ? comprimir(t.fim) : t.fim);

    if (t.critica) {
      const diasEmFalta = diasEntre(inicio, hoje);
      if (diasEmFalta > 0) avisos.push({ id: t.id, titulo: t.titulo, inicio, fim, diasEmFalta });
    }
    return { id: t.id, inicio, fim, comprimida: aComprimir };
  });

  return { tarefas: materializadas, diasDisponiveis, diasNecessarios, comprimido, avisos };
}
