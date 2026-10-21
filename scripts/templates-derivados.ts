// Templates derivados de outro template do Excel (decisão 022), em vez de escritos de raiz: o Fórum e a
// Conferência são versões reduzidas do T03 Congresso. Herdam do T03 os títulos, as notas, as fases, os papéis e
// as rubricas: mudar uma nota no Excel muda-a também aqui, na próxima conversão. Tarefas novas no T03 também
// entram; para as deixar de fora, acrescentá-las a `saem`.
//
// IDs: cada tarefa derivada guarda o número da tarefa de origem (T03-018 → T05-018). Os números das tarefas
// que saem ficam por usar, para nenhum ID mudar de significado (CLAUDE.md, secção 9).
//
// Prazos: o último mês antes do evento e o que vem depois ficam como no T03 (gerador, crachás, ensaio,
// relatórios). O planeamento anterior a D-30 encolhe na mesma proporção, para começar no horizonte do derivado.

export interface DefinicaoDerivado {
  codigo: string;
  nome: string;
  descricao: string;
  origem: string;
  // Dias antes do evento em que começa a primeira tarefa.
  horizonte: number;
  // Tarefas da origem que não entram (IDs da origem).
  saem: string[];
  // Tarefas que mantêm os prazos da origem, porque a nota o exige.
  mantemPrazos: string[];
  // Rubricas de orçamento da origem que não entram (pela descrição).
  rubricasQueSaem: string[];
  // Textos da origem que não servem ao derivado (ex.: "congresso"), por ID de tarefa ou descrição de rubrica.
  titulos: Record<string, string>;
  rubricas: Record<string, string>;
}

// A partir de quantos dias antes do evento os prazos ficam iguais aos da origem.
export const DIAS_SEM_ALTERACAO = 30;

const SEM_CONGRESSO = {
  titulos: { 'T03-018': 'Criar site ou página do evento' },
  rubricas: { 'Site do congresso': 'Site do evento' },
};

// Aprovados pelo Adriano a 21/10/2026.
export const DERIVADOS: DefinicaoDerivado[] = [
  {
    codigo: 'T05',
    nome: 'Fórum',
    descricao: 'Debate de um dia, com painéis e entrada por convite · Comprador: instituição, associação, empresa · Horizonte típico: 3 meses',
    origem: 'T03',
    horizonte: 90,
    saem: [
      'T03-004', // comissão científica
      'T03-008', // ponto de equilíbrio (sem inscrições pagas)
      'T03-017', // chamada de trabalhos
      'T03-021', // escalões de inscrição
      'T03-022', // pagamento das inscrições
      'T03-024', // vistos e viagens de oradores estrangeiros
      'T03-025', // alojamento dos oradores
      'T03-030', // prazo de submissão de trabalhos
      'T03-031', // tradução simultânea
      'T03-033', // avaliação das submissões
      'T03-047', // preparar certificados
      'T03-067', // envio de certificados
    ],
    mantemPrazos: [],
    rubricasQueSaem: ['Tradução simultânea', 'Viagens de oradores', 'Alojamento de oradores'],
    ...SEM_CONGRESSO,
  },
  {
    codigo: 'T06',
    nome: 'Conferência',
    descricao: 'Um dia de palestras, com inscrições abertas (não é para a imprensa) · Comprador: instituição, associação, empresa · Horizonte típico: 4 meses',
    origem: 'T03',
    horizonte: 120,
    saem: [
      'T03-004', // comissão científica
      'T03-017', // chamada de trabalhos
      'T03-030', // prazo de submissão de trabalhos
      'T03-033', // avaliação das submissões
    ],
    // A nota pede 90 dias para os vistos: "É a causa número um de oradores que não chegam."
    mantemPrazos: ['T03-024'],
    rubricasQueSaem: [],
    ...SEM_CONGRESSO,
  },
];
