// Tipos dos templates de projecto (CLAUDE.md, secção 9). Os dados vêm de data/templates/*.json,
// gerados a partir do Excel em docs/templates/ por scripts/converter-templates.ts.

export interface Taxonomia {
  fases: string[];
  categoriasTarefa: string[];
  papeis: string[];
  categoriasOrcamento: string[];
}

export interface TarefaTemplate {
  // Identificador estável (ex.: T01-022). Nunca reutilizado.
  id: string;
  fase: string;
  categoria: string;
  // Verbo no infinitivo.
  titulo: string;
  papel: string;
  // Dias relativos ao dia do evento: -21 = D-21, 0 = D0, 7 = D+7.
  inicio: number;
  // Igual ao início nas tarefas de um dia.
  fim: number;
  // Crítica: nunca se comprime; avisa-se se o prazo não chega.
  critica: boolean;
  // O conhecimento operacional angolano: mostrar com destaque ao abrir a tarefa.
  nota: string | null;
}

export interface RubricaTemplate {
  categoria: string;
  descricao: string;
  obrigatoria: boolean;
  nota: string | null;
}

export interface Template {
  codigo: string;
  nome: string;
  // Texto do Excel, ex.: "Comprador: instituição, agência… · Horizonte típico: 21 dias".
  descricao: string;
  // Identificador do conteúdo (hash): muda sempre que o template muda. Os projectos guardam-no.
  versao: string;
  tarefas: TarefaTemplate[];
  rubricas: RubricaTemplate[];
}
