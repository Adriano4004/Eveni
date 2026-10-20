import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PASTA_DADOS } from '../scripts/converter-templates.js';
import { dataValida, diasEntre, formatarData, hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import { EventoNoPassado, materializar } from '../src/shared/materializacao.js';
import type { TarefaTemplate, Template } from '../src/shared/templates.js';

const ler = (codigo: string): Template => JSON.parse(readFileSync(join(PASTA_DADOS, `${codigo}.json`), 'utf8'));
const templates = ['T01', 'T02', 'T03', 'T04'].map(ler);
const T01 = templates[0]!;

const HOJE = '2026-10-20';
const evento = (dias: number) => somarDias(HOJE, dias);

const tarefa = (id: string, inicio: number, fim: number, critica = false): TarefaTemplate => ({
  id,
  fase: 'Pré Produção',
  categoria: 'Estratégia',
  titulo: `Tarefa ${id}`,
  papel: 'Gestor',
  inicio,
  fim,
  critica,
  nota: null,
});

describe('datas de calendário', () => {
  it('soma dias atravessando meses, anos e anos bissextos', () => {
    expect(somarDias('2026-10-20', 0)).toBe('2026-10-20');
    expect(somarDias('2026-10-20', -21)).toBe('2026-09-29');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2028-03-01', -1)).toBe('2028-02-29');
    expect(somarDias('2027-03-01', -1)).toBe('2027-02-28');
    expect(somarDias('2027-10-20', -365)).toBe('2026-10-20');
  });

  it('conta dias entre datas', () => {
    expect(diasEntre('2026-10-20', '2026-11-10')).toBe(21);
    expect(diasEntre('2026-11-10', '2026-10-20')).toBe(-21);
    expect(diasEntre('2028-02-28', '2028-03-01')).toBe(2);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-1-01', '20/10/2026', '', '2026-10-20T00:00:00Z', 'amanhã'])('recusa a data inválida %j', (d) => {
    expect(dataValida(d)).toBe(false);
    expect(() => somarDias(d, 1)).toThrow();
  });

  it('o "hoje" é o dia em Luanda (UTC+1), não em UTC', () => {
    // 23:30 em UTC já é meia-noite e meia do dia seguinte em Luanda.
    expect(hojeEmLuanda(new Date('2026-10-19T23:30:00Z'))).toBe('2026-10-20');
    expect(hojeEmLuanda(new Date('2026-10-19T22:59:59Z'))).toBe('2026-10-19');
    expect(hojeEmLuanda(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01');
    // Sem hora de Verão: o mesmo desvio em Julho.
    expect(hojeEmLuanda(new Date('2026-07-01T23:00:00Z'))).toBe('2026-07-02');
  });

  it('apresenta em dd/mm/aaaa', () => {
    expect(formatarData('2026-09-29')).toBe('29/09/2026');
    expect(() => formatarData('2026-02-30')).toThrow();
  });
});

describe('materialização sem compressão', () => {
  it('com tempo de sobra, cada tarefa fica na data do evento mais o offset', () => {
    const r = materializar(T01.tarefas, evento(60), HOJE);
    expect(r.comprimido).toBe(false);
    expect(r.avisos).toEqual([]);
    expect(r.diasNecessarios).toBe(21);
    expect(r.diasDisponiveis).toBe(60);
    for (const [i, t] of T01.tarefas.entries()) {
      expect(r.tarefas[i]).toEqual({ id: t.id, inicio: somarDias(evento(60), t.inicio), fim: somarDias(evento(60), t.fim), comprimida: false });
    }
  });

  it('exemplo concreto do T01: D-21 cai 21 dias antes do evento', () => {
    const r = materializar(T01.tarefas, '2026-11-10', HOJE);
    expect(r.tarefas[0]).toMatchObject({ id: 'T01-001', inicio: '2026-10-20', fim: '2026-10-20' });
  });

  it('exactamente no offset máximo (D-21 = hoje): não comprime e não avisa', () => {
    const r = materializar(T01.tarefas, evento(21), HOJE);
    expect(r.comprimido).toBe(false);
    expect(r.avisos).toEqual([]);
    expect(r.tarefas.map((t) => t.inicio).sort()[0]).toBe(HOJE);
  });

  it('um dia depois do offset máximo: não comprime', () => {
    const r = materializar(T01.tarefas, evento(22), HOJE);
    expect(r.comprimido).toBe(false);
    expect(r.tarefas.map((t) => t.inicio).sort()[0]).toBe(evento(1));
  });

  it('preserva a ordem e os IDs do template', () => {
    const r = materializar(T01.tarefas, evento(5), HOJE);
    expect(r.tarefas.map((t) => t.id)).toEqual(T01.tarefas.map((t) => t.id));
  });
});

describe('regra de compressão', () => {
  it('um dia antes do offset máximo (20 dias para um template de 21): comprime e avisa as críticas de D-21', () => {
    const r = materializar(T01.tarefas, evento(20), HOJE);
    expect(r.comprimido).toBe(true);
    const criticasD21 = T01.tarefas.filter((t) => t.critica && t.inicio === -21).map((t) => t.id);
    expect(criticasD21.length).toBeGreaterThan(0);
    expect(r.avisos.map((a) => a.id)).toEqual(criticasD21);
    for (const a of r.avisos) expect(a.diasEmFalta).toBe(1);
  });

  it('comprime proporcionalmente: metade do tempo, metade da antecedência', () => {
    const tarefas = [tarefa('A', -20, -20), tarefa('B', -10, -6), tarefa('C', -1, 0), tarefa('D', 0, 0), tarefa('E', 3, 7)];
    const r = materializar(tarefas, evento(10), HOJE);
    expect(r.tarefas.map((t) => [t.id, diasEntre(evento(10), t.inicio), diasEntre(evento(10), t.fim), t.comprimida])).toEqual([
      ['A', -10, -10, true],
      ['B', -5, -3, true],
      // -0,5 arredonda para o lado do evento.
      ['C', 0, 0, true],
      ['D', 0, 0, false],
      ['E', 3, 7, false],
    ]);
  });

  it('nunca comprime tarefas críticas: mantêm o offset e aparecem nos avisos', () => {
    const tarefas = [tarefa('N', -30, -25), tarefa('K', -30, -25, true), tarefa('K2', -5, -1, true)];
    const r = materializar(tarefas, evento(10), HOJE);
    const k = r.tarefas.find((t) => t.id === 'K')!;
    expect(k).toEqual({ id: 'K', inicio: evento(-20), fim: evento(-15), comprimida: false });
    // K2 começa a D-5, dentro dos 10 dias: não tem aviso.
    expect(r.tarefas.find((t) => t.id === 'K2')).toMatchObject({ inicio: evento(5), comprimida: false });
    expect(r.avisos).toEqual([{ id: 'K', titulo: 'Tarefa K', inicio: evento(-20), fim: evento(-15), diasEmFalta: 20 }]);
    expect(r.tarefas.find((t) => t.id === 'N')).toMatchObject({ inicio: evento(0), comprimida: true });
  });

  it('casamento a 60 dias (exemplo do CLAUDE.md): os convites críticos de D-90 ou antes ficam nos avisos', () => {
    const t02 = ler('T02');
    const r = materializar(t02.tarefas, evento(60), HOJE);
    const esperadas = t02.tarefas.filter((t) => t.critica && t.inicio < -60).map((t) => t.id);
    expect(esperadas.length).toBeGreaterThan(0);
    expect(r.avisos.map((a) => a.id)).toEqual(esperadas);
    for (const a of r.avisos) expect(a.inicio < HOJE).toBe(true);
  });

  it('evento hoje: todas as não críticas anteriores passam para hoje; todas as críticas anteriores avisam', () => {
    const r = materializar(T01.tarefas, HOJE, HOJE);
    expect(r.diasDisponiveis).toBe(0);
    T01.tarefas.forEach((t, i) => {
      const m = r.tarefas[i]!;
      if (t.critica || t.inicio >= 0) {
        expect(m.inicio).toBe(somarDias(HOJE, t.inicio));
      } else {
        expect(m.inicio).toBe(HOJE);
        expect(m.fim).toBe(t.fim >= 0 ? somarDias(HOJE, t.fim) : HOJE);
      }
    });
    expect(r.avisos.map((a) => a.id)).toEqual(T01.tarefas.filter((t) => t.critica && t.inicio < 0).map((t) => t.id));
  });

  it('evento amanhã: as não críticas ficam entre hoje e amanhã', () => {
    const r = materializar(T01.tarefas, evento(1), HOJE);
    T01.tarefas.forEach((t, i) => {
      if (t.critica || t.inicio >= 0) return;
      expect([HOJE, evento(1)]).toContain(r.tarefas[i]!.inicio);
    });
    expect(r.avisos.map((a) => a.id)).toEqual(T01.tarefas.filter((t) => t.critica && t.inicio < -1).map((t) => t.id));
  });

  it('evento no passado: recusa', () => {
    expect(() => materializar(T01.tarefas, evento(-1), HOJE)).toThrow(EventoNoPassado);
  });

  it('template sem tarefas antes do evento: nada a comprimir', () => {
    const r = materializar([tarefa('A', 0, 2)], HOJE, HOJE);
    expect(r).toMatchObject({ diasNecessarios: 0, comprimido: false, avisos: [] });
  });
});

describe('propriedades em todos os templates e todas as antecedências', () => {
  // Cada template, de "evento hoje" até um mês depois do seu horizonte: as regras têm de valer sempre.
  for (const t of templates) {
    it(`${t.codigo}: invariantes de 0 a ${-Math.min(...t.tarefas.map((x) => x.inicio)) + 30} dias`, () => {
      const horizonte = -Math.min(...t.tarefas.map((x) => x.inicio));
      for (let dias = 0; dias <= horizonte + 30; dias++) {
        const dataEvento = evento(dias);
        const r = materializar(t.tarefas, dataEvento, HOJE);
        expect(r.comprimido).toBe(dias < horizonte);

        t.tarefas.forEach((original, i) => {
          const m = r.tarefas[i]!;
          const offInicio = diasEntre(dataEvento, m.inicio);
          const offFim = diasEntre(dataEvento, m.fim);
          expect(m.id).toBe(original.id);
          // Uma tarefa nunca acaba antes de começar.
          expect(offFim).toBeGreaterThanOrEqual(offInicio);

          if (original.critica || original.inicio >= 0 || !r.comprimido) {
            // Críticas, tarefas do dia do evento ou depois, e templates com tempo: offset intacto.
            expect([offInicio, offFim]).toEqual([original.inicio, original.fim]);
            expect(m.comprimida).toBe(false);
          } else {
            // Não críticas comprimidas: nunca antes de hoje, nunca mais cedo do que o original,
            // e o que era antes do evento continua antes ou no dia do evento.
            expect(m.comprimida).toBe(true);
            expect(m.inicio >= HOJE).toBe(true);
            expect(offInicio).toBeGreaterThanOrEqual(original.inicio);
            expect(offInicio).toBeLessThanOrEqual(0);
            expect(offFim).toBeGreaterThanOrEqual(original.fim);
            if (original.fim >= 0) expect(offFim).toBe(original.fim);
          }
        });

        // Avisos: exactamente as críticas que deveriam ter começado antes de hoje.
        const esperados = t.tarefas.filter((x) => x.critica && x.inicio < -dias).map((x) => x.id);
        expect(r.avisos.map((a) => a.id)).toEqual(esperados);
        for (const a of r.avisos) expect(a.diasEmFalta).toBe(diasEntre(a.inicio, HOJE));
      }
    });
  }

  it('a ordem relativa das não críticas mantém-se depois de comprimir', () => {
    for (let dias = 0; dias < 21; dias++) {
      const r = materializar(T01.tarefas, evento(dias), HOJE);
      const pares = T01.tarefas.map((t, i) => [t, r.tarefas[i]!] as const).filter(([t]) => !t.critica && t.inicio < 0);
      for (const [a, ma] of pares) {
        for (const [b, mb] of pares) {
          if (a.inicio < b.inicio) expect(ma.inicio <= mb.inicio).toBe(true);
        }
      }
    }
  });
});
