// Templates derivados de outro template do Excel (decisões 022 e 025), em vez de escritos de raiz: o Fórum e a
// Conferência são versões reduzidas do T03 Congresso, e o Aniversário do T02 Casamento. Herdam da origem os
// títulos, as notas, as fases, os papéis e as rubricas: mudar uma nota no Excel muda-a também aqui, na próxima
// conversão (salvo as notas reescritas em `notas`). Tarefas novas na origem também entram; para as deixar de
// fora, acrescentá-las a `saem`.
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
  notas?: Record<string, string>;
  rubricas: Record<string, string>;
  // Notas de rubricas da origem (pela descrição na origem) a substituir; null apaga a nota.
  notasRubricas?: Record<string, string | null>;
}

// A partir de quantos dias antes do evento os prazos ficam iguais aos da origem.
export const DIAS_SEM_ALTERACAO = 30;

const SEM_CONGRESSO = {
  titulos: { 'T03-018': 'Criar site ou página do evento' },
  rubricas: { 'Site do congresso': 'Site do evento' },
};

// Aprovados pelo Adriano a 21/10/2026.
// A contingência vem do texto da rubrica ("Contingência (10%)", decisão 019): renomeá-la muda a percentagem.
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
  {
    codigo: 'T07',
    nome: 'Aniversário',
    descricao: 'Festa de aniversário de um dia (15 anos, 50 anos), num só espaço · Comprador: pessoa singular, organizador de festas · Horizonte típico: 4 meses',
    origem: 'T02',
    horizonte: 120,
    saem: [
      'T02-004', // decidir o alembamento
      'T02-005', // espaço da cerimónia
      'T02-007', // reunião das famílias para o alembamento
      'T02-009', // lobolo
      'T02-010', // exigências da família da noiva
      'T02-011', // conservatória do registo civil
      'T02-012', // cerimónia religiosa
      'T02-014', // realização do alembamento
      'T02-015', // vestido da noiva
      'T02-016', // documentação para o registo civil
      'T02-017', // curso pré-matrimonial
      'T02-027', // fato do noivo
      'T02-031', // trajes dos padrinhos e damas
      'T02-032', // alianças
      'T02-035', // transporte dos noivos
      'T02-036', // alojamento de convidados de fora
      'T02-042', // provas do vestido
      'T02-043', // alinhamento da cerimónia
      'T02-050', // ensaio da cerimónia
      'T02-051', // montagem do espaço da cerimónia
      'T02-057', // cerimónia
      'T02-066', // certidão de casamento
    ],
    mantemPrazos: [],
    rubricasQueSaem: [
      'Espaço da cerimónia',
      'Lobolo',
      'Alembamento',
      'Vestido da noiva',
      'Fato do noivo',
      'Alianças',
      'Transporte dos noivos',
      'Taxas de registo civil',
      'Alojamento de convidados',
    ],
    titulos: {
      'T02-006': 'Visitar e reservar espaço da festa',
      'T02-008': 'Contratar organizador ou definir coordenador',
      'T02-044': 'Definir alinhamento da festa',
      'T02-052': 'Montagem do espaço da festa',
      'T02-059': 'Festa: execução do alinhamento',
    },
    notas: {
      'T02-008': 'Alguém tem de decidir no dia. Se for o aniversariante ou quem paga a festa, não há coordenação.',
      'T02-021': 'Contratar por portefólio completo de uma festa, não por selecção das melhores fotos de várias.',
      'T02-037': 'Com os acessórios e o traje reais. A prova sem eles não prova nada.',
      'T02-029': 'Seis semanas antes. Quem vem de fora da cidade precisa de tempo para se organizar.',
      'T02-060': 'Uma pessoa, com telefone, que não é o aniversariante nem quem recebe os convidados.',
      'T02-068': 'Alimenta a base de fornecedores da plataforma. É o que torna a próxima festa mais fácil.',
      'T02-069': 'Prazo contratado por escrito. Atrasos na entrega são a queixa mais comum — e a razão para o contrato o fixar.',
    },
    rubricas: {
      'Espaço do copo-de-água': 'Espaço da festa',
      // Regra geral do CLAUDE.md: 10%; os 15% são do casamento.
      'Contingência (15%)': 'Contingência (10%)',
    },
    // A nota da origem fala em quinze por cento e doze meses.
    notasRubricas: { 'Contingência (15%)': null },
  },
];
