// Convidados de um projecto (decisão 018): tipos da API, telemóveis e leitura de listas coladas do Excel.
// Partilhado entre o servidor e os ecrãs.

export const MAX_ACOMPANHANTES = 10;
// Travão contra abusos, não um limite de plano.
export const MAX_CONVIDADOS_POR_PROJECTO = 2000;
export const MAX_LINHAS_IMPORTACAO = 500;

export const RESPOSTAS = ['pending', 'yes', 'no'] as const;
export type Resposta = (typeof RESPOSTAS)[number];

export interface Convidado {
  id: string;
  nome: string;
  // +<indicativo><número>, ex.: +244923456789.
  telemovel: string | null;
  email: string | null;
  acompanhantes: number;
  resposta: Resposta;
  acompanhantesConfirmados: number;
  respondidoEm: string | null;
}

export interface TotaisConvidados {
  convidados: number;
  vao: number;
  naoVao: number;
  semResposta: number;
  // Quem disse que vai, mais os acompanhantes confirmados.
  pessoas: number;
}

export interface ListaConvidados {
  projecto: { id: string; nome: string };
  // Dono ou editor, com o projecto activo.
  podeAlterar: boolean;
  convidados: Convidado[];
  totais: TotaisConvidados;
}

export interface ResultadoImportacao {
  importados: number;
  // Linhas ignoradas por já existir um convidado com o mesmo telemóvel ou e-mail (na lista ou na colagem).
  repetidos: { linha: number; nome: string }[];
}

export function calcularTotais(convidados: Pick<Convidado, 'resposta' | 'acompanhantesConfirmados'>[]): TotaisConvidados {
  const vao = convidados.filter((c) => c.resposta === 'yes');
  return {
    convidados: convidados.length,
    vao: vao.length,
    naoVao: convidados.filter((c) => c.resposta === 'no').length,
    semResposta: convidados.filter((c) => c.resposta === 'pending').length,
    pessoas: vao.reduce((soma, c) => soma + 1 + c.acompanhantesConfirmados, 0),
  };
}

// Telemóvel num só formato, para detectar repetidos: +<indicativo><número>.
// Um número angolano (9 dígitos, começa por 9, ou por 2 se for fixo) pode vir sem indicativo. Os de outros países têm de o trazer
// (com + ou 00). Devolve null se não for um número válido.
export function normalizarTelemovel(texto: string): string | null {
  const limpo = texto.trim().replace(/[\s.\-()]/g, '');
  if (/^[29]\d{8}$/.test(limpo)) return `+244${limpo}`;
  if (/^244[29]\d{8}$/.test(limpo)) return `+${limpo}`;
  const comMais = limpo.startsWith('00') ? `+${limpo.slice(2)}` : limpo;
  return /^\+[1-9]\d{7,14}$/.test(comMais) ? comMais : null;
}

// Para mostrar: +244 923 456 789. Outros países ficam como estão.
export function formatarTelemovel(telemovel: string): string {
  const angolano = /^\+244(\d{3})(\d{3})(\d{3})$/.exec(telemovel);
  return angolano ? `+244 ${angolano[1]} ${angolano[2]} ${angolano[3]}` : telemovel;
}

// Uma linha da colagem, ainda por validar (texto tal como veio). `linha` conta a partir de 1, como no Excel.
export interface LinhaColada {
  linha: number;
  nome: string;
  telemovel: string;
  email: string;
  acompanhantes: string;
}

// Parte uma linha pelo separador, respeitando as aspas de CSV ("Silva, João" fica numa só célula; "" é uma aspa).
function partirLinha(linha: string, separador: string): string[] {
  const celulas: string[] = [];
  let actual = '';
  let entreAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i]!;
    if (entreAspas) {
      if (ch === '"' && linha[i + 1] === '"') {
        actual += '"';
        i++;
      } else if (ch === '"') entreAspas = false;
      else actual += ch;
    } else if (ch === '"' && actual.trim() === '') {
      entreAspas = true;
      actual = '';
    } else if (ch === separador) {
      celulas.push(actual.trim());
      actual = '';
    } else actual += ch;
  }
  celulas.push(actual.trim());
  return celulas;
}

type Coluna = Exclude<keyof LinhaColada, 'linha'>;
const ORDEM_POR_OMISSAO: Coluna[] = ['nome', 'telemovel', 'email', 'acompanhantes'];

// Reconhece a coluna pelo título (sem acentos nem maiúsculas).
function colunaDoTitulo(titulo: string): Coluna | null {
  const t = titulo
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
  // Só títulos de coluna exactos: um convidado chamado "Nome…" na primeira linha não é um título.
  if (/^nome( (do|da) convidad[oa]| completo)?$/.test(t)) return 'nome';
  if (/telem|telef|contacto|whatsapp|numero|celular/.test(t)) return 'telemovel';
  if (/e-?mail|correio/.test(t)) return 'email';
  if (/acompanh|\+ ?1|^extra/.test(t)) return 'acompanhantes';
  return null;
}

// Lê linhas copiadas do Excel (colunas separadas por tabulação) ou de um CSV (";" ou ",").
// A primeira linha pode ter títulos: nesse caso a ordem das colunas vem deles. Linhas vazias são ignoradas.
export function lerColagem(texto: string): LinhaColada[] {
  const linhas = texto.replace(/\r\n?/g, '\n').split('\n');
  const separador = texto.includes('\t') ? '\t' : texto.includes(';') ? ';' : ',';
  const partir = (l: string) => partirLinha(l, separador);

  let ordem: (Coluna | null)[] = ORDEM_POR_OMISSAO;
  let inicio = 0;
  const primeira = linhas.findIndex((l) => l.trim() !== '');
  if (primeira >= 0) {
    const titulos = partir(linhas[primeira]!).map(colunaDoTitulo);
    if (titulos.includes('nome')) {
      ordem = titulos;
      inicio = primeira + 1;
    }
  }

  const resultado: LinhaColada[] = [];
  for (let i = inicio; i < linhas.length; i++) {
    if (linhas[i]!.trim() === '') continue;
    const celulas = partir(linhas[i]!);
    const linha: LinhaColada = { linha: i + 1, nome: '', telemovel: '', email: '', acompanhantes: '' };
    ordem.forEach((coluna, j) => {
      if (coluna && !linha[coluna]) linha[coluna] = celulas[j] ?? '';
    });
    resultado.push(linha);
  }
  return resultado;
}
