// Telemóveis, colagens do Excel e validação de convidados (sem base de dados).
import { describe, expect, it } from 'vitest';
import { calcularTotais, formatarTelemovel, lerColagem, normalizarTelemovel } from '../src/shared/convidados.js';
import { actualizarConvidado, dadosConvidado } from '../src/shared/esquemas.js';

describe('normalizarTelemovel', () => {
  it.each([
    ['923456789', '+244923456789'],
    ['923 456 789', '+244923456789'],
    ['923-456-789', '+244923456789'],
    ['+244 923 456 789', '+244923456789'],
    ['244923456789', '+244923456789'],
    ['00244 923 456 789', '+244923456789'],
    ['(+244) 923.456.789', '+244923456789'],
    ['222 123 456', '+244222123456'],
    ['+351 912 345 678', '+351912345678'],
    ['00351912345678', '+351912345678'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarTelemovel(entrada)).toBe(esperado);
  });

  it.each(['', '12345', '823456789', '92345678', '9234567890', 'abc', '+0123456789', '+12', '912345678901234567', '++244923456789'])(
    'recusa %j',
    (entrada) => {
      expect(normalizarTelemovel(entrada)).toBeNull();
    },
  );

  it('formata os angolanos em grupos de três; os outros ficam como estão', () => {
    expect(formatarTelemovel('+244923456789')).toBe('+244 923 456 789');
    expect(formatarTelemovel('+351912345678')).toBe('+351912345678');
  });
});

describe('lerColagem', () => {
  it('colunas do Excel (tabulação) pela ordem Nome, Telemóvel, E-mail, Acompanhantes', () => {
    expect(lerColagem('Ana Silva\t923456789\tana@exemplo.ao\t2\nBruno Neto\t924000111\t\t')).toEqual([
      { linha: 1, nome: 'Ana Silva', telemovel: '923456789', email: 'ana@exemplo.ao', acompanhantes: '2' },
      { linha: 2, nome: 'Bruno Neto', telemovel: '924000111', email: '', acompanhantes: '' },
    ]);
  });

  it('com títulos, a ordem das colunas vem deles (com ou sem acentos); colunas desconhecidas ignoram-se', () => {
    const texto = 'Contacto\tCargo\tNOME\tE-mail\n923456789\tDirector\tAna Silva\tana@exemplo.ao\n';
    expect(lerColagem(texto)).toEqual([{ linha: 2, nome: 'Ana Silva', telemovel: '923456789', email: 'ana@exemplo.ao', acompanhantes: '' }]);
    expect(lerColagem('Nome;Telemóvel;Acompanhantes\nAna;923456789;1')[0]).toMatchObject({ nome: 'Ana', telemovel: '923456789', acompanhantes: '1' });
  });

  it('CSV com ";" ou ",", aspas, linhas vazias e quebras de linha do Windows', () => {
    expect(lerColagem('"Ana Silva";"923456789"\r\n\r\nBruno;924000111\r\n')).toEqual([
      { linha: 1, nome: 'Ana Silva', telemovel: '923456789', email: '', acompanhantes: '' },
      { linha: 3, nome: 'Bruno', telemovel: '924000111', email: '', acompanhantes: '' },
    ]);
    expect(lerColagem('Ana,923456789')[0]).toMatchObject({ nome: 'Ana', telemovel: '923456789' });
  });

  it('separadores dentro de aspas não partem a célula', () => {
    expect(lerColagem('"Silva, João",923456789\n"Ana ""Kika"" Lopes",924000111')).toEqual([
      { linha: 1, nome: 'Silva, João', telemovel: '923456789', email: '', acompanhantes: '' },
      { linha: 2, nome: 'Ana "Kika" Lopes', telemovel: '924000111', email: '', acompanhantes: '' },
    ]);
  });

  it('um convidado chamado "Nome…" na primeira linha não é tomado por títulos', () => {
    expect(lerColagem('Nomeriano Silva\t923456789\nAna\t924000111').map((l) => l.nome)).toEqual(['Nomeriano Silva', 'Ana']);
    expect(lerColagem('Nome completo\tTelemóvel\nAna\t923456789')).toEqual([
      { linha: 2, nome: 'Ana', telemovel: '923456789', email: '', acompanhantes: '' },
    ]);
  });

  it('só nomes, um por linha', () => {
    expect(lerColagem('Tia Maria e família\nPadrinhos').map((l) => l.nome)).toEqual(['Tia Maria e família', 'Padrinhos']);
  });

  it('colagem vazia', () => {
    expect(lerColagem('  \n\n')).toEqual([]);
  });
});

describe('validação de convidados', () => {
  it('normaliza telemóvel e e-mail; vazios ficam null; acompanhantes por omissão 0', () => {
    expect(dadosConvidado.parse({ nome: ' Ana ', telemovel: '923 456 789', email: ' Ana@Exemplo.AO ', acompanhantes: '2' })).toEqual({
      nome: 'Ana',
      telemovel: '+244923456789',
      email: 'ana@exemplo.ao',
      acompanhantes: 2,
    });
    expect(dadosConvidado.parse({ nome: 'Ana', telemovel: '', email: '' })).toEqual({ nome: 'Ana', telemovel: null, email: null, acompanhantes: 0 });
  });

  it.each([
    [{ nome: '' }, 'nome'],
    [{ nome: 'Ana\u0000' }, 'nome'],
    [{ nome: 'x'.repeat(121) }, 'nome'],
    [{ nome: 'Ana', telemovel: '123' }, 'telemovel'],
    [{ nome: 'Ana', email: 'ana' }, 'email'],
    [{ nome: 'Ana', acompanhantes: '11' }, 'acompanhantes'],
    [{ nome: 'Ana', acompanhantes: '-1' }, 'acompanhantes'],
    [{ nome: 'Ana', acompanhantes: '1.5' }, 'acompanhantes'],
    [{ nome: 'Ana', acompanhantes: 'dois' }, 'acompanhantes'],
  ])('recusa %j (campo %s)', (dados, campo) => {
    const r = dadosConvidado.safeParse(dados);
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.path[0]).toBe(campo);
  });

  it('resposta e acompanhantes confirmados são opcionais ao alterar', () => {
    expect(actualizarConvidado.parse({ nome: 'Ana' })).toEqual({ nome: 'Ana', telemovel: null, email: null, acompanhantes: 0 });
    expect(actualizarConvidado.safeParse({ nome: 'Ana', resposta: 'talvez' }).success).toBe(false);
  });

  it('totais: quem vai conta com os acompanhantes confirmados', () => {
    expect(
      calcularTotais([
        { resposta: 'yes', acompanhantesConfirmados: 2 },
        { resposta: 'yes', acompanhantesConfirmados: 0 },
        { resposta: 'no', acompanhantesConfirmados: 0 },
        { resposta: 'pending', acompanhantesConfirmados: 0 },
      ]),
    ).toEqual({ convidados: 4, vao: 2, naoVao: 1, semResposta: 1, pessoas: 4 });
  });
});
