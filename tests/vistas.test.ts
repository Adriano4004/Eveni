import { describe, expect, it } from 'vitest';
import type { TarefaProjecto } from '../src/shared/projectos.js';
import {
  filtrarTarefas,
  filtrosActivos,
  intervaloDeMeses,
  semanasDoMes,
  somarMeses,
  tarefasNoDia,
  valoresDistintos,
} from '../src/shared/vistas.js';

const EU = '11111111-1111-4111-8111-111111111111';
const OUTRA = '22222222-2222-4222-8222-222222222222';

const tarefa = (id: string, extra: Partial<TarefaProjecto> = {}): TarefaProjecto => ({
  id,
  idTemplate: `T01-${id}`,
  fase: 'Pré Produção',
  categoria: 'Estratégia',
  titulo: `Tarefa ${id}`,
  papel: 'Gestor',
  inicio: '2026-11-02',
  fim: '2026-11-02',
  critica: false,
  comprimida: false,
  nota: null,
  estado: 'pending',
  responsavel: null,
  emAtraso: false,
  concluidaEm: null,
  ...extra,
});

const tarefas = [
  tarefa('a', { critica: true, emAtraso: true, responsavel: { id: EU, nome: 'Ana' } }),
  tarefa('b', { fase: 'Produção', categoria: 'Técnica', papel: 'Técnica', estado: 'done', responsavel: { id: OUTRA, nome: 'Bruno' } }),
  tarefa('c', { categoria: 'Comunicação', papel: 'Comunicação', estado: 'in_progress' }),
  tarefa('d', { fase: 'Pós Produção', critica: true }),
];
const ids = (lista: TarefaProjecto[]) => lista.map((t) => t.id);

describe('filtros das tarefas', () => {
  it('sem filtros, todas', () => {
    expect(ids(filtrarTarefas(tarefas, {}, EU))).toEqual(['a', 'b', 'c', 'd']);
  });

  it.each([
    [{ fase: 'Produção' }, ['b']],
    [{ categoria: 'Estratégia' }, ['a', 'd']],
    [{ papel: 'Comunicação' }, ['c']],
    [{ estado: 'pending' as const }, ['a', 'd']],
    [{ estado: 'done' as const }, ['b']],
    [{ responsavel: 'eu' }, ['a']],
    [{ responsavel: OUTRA }, ['b']],
    [{ responsavel: 'ninguem' }, ['c', 'd']],
    [{ soCriticas: true }, ['a', 'd']],
    [{ soEmAtraso: true }, ['a']],
    [{ soCriticas: true, estado: 'pending' as const, fase: 'Pós Produção' }, ['d']],
    [{ categoria: 'Inexistente' }, []],
  ])('%j', (filtros, esperado) => {
    expect(ids(filtrarTarefas(tarefas, filtros, EU))).toEqual(esperado);
  });

  it('conta os filtros activos (vazios e desligados não contam)', () => {
    expect(filtrosActivos({})).toBe(0);
    expect(filtrosActivos({ fase: '', soCriticas: false, responsavel: undefined })).toBe(0);
    expect(filtrosActivos({ fase: 'Produção', soEmAtraso: true })).toBe(2);
  });

  it('valores distintos pela ordem do template', () => {
    expect(valoresDistintos(tarefas, 'fase')).toEqual(['Pré Produção', 'Produção', 'Pós Produção']);
    expect(valoresDistintos(tarefas, 'categoria')).toEqual(['Estratégia', 'Técnica', 'Comunicação']);
  });
});

describe('calendário', () => {
  it('soma meses atravessando anos', () => {
    expect(somarMeses('2026-10', 1)).toBe('2026-11');
    expect(somarMeses('2026-12', 1)).toBe('2027-01');
    expect(somarMeses('2027-01', -1)).toBe('2026-12');
    expect(somarMeses('2026-10', -22)).toBe('2024-12');
  });

  it('semanas de segunda a domingo, com os dias de fora do mês vazios', () => {
    // 1 de Outubro de 2026 é uma quinta-feira; 31 é um sábado.
    const semanas = semanasDoMes('2026-10');
    expect(semanas[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(semanas.at(-1)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', null]);
    expect(semanas.flat().filter(Boolean)).toHaveLength(31);
  });

  it('Fevereiro de ano bissexto e mês que começa à segunda-feira', () => {
    expect(semanasDoMes('2028-02').flat().filter(Boolean)).toHaveLength(29);
    // 1 de Junho de 2026 é uma segunda-feira.
    expect(semanasDoMes('2026-06')[0]![0]).toBe('2026-06-01');
  });

  it('tarefas no dia incluem as que estão a decorrer', () => {
    const lista = [
      tarefa('x', { inicio: '2026-11-01', fim: '2026-11-03' }),
      tarefa('y', { inicio: '2026-11-03', fim: '2026-11-03' }),
      tarefa('z', { inicio: '2026-11-04', fim: '2026-11-05' }),
    ];
    expect(ids(tarefasNoDia(lista, '2026-11-01'))).toEqual(['x']);
    expect(ids(tarefasNoDia(lista, '2026-11-03'))).toEqual(['x', 'y']);
    expect(ids(tarefasNoDia(lista, '2026-11-06'))).toEqual([]);
  });

  it('intervalo de meses vai da primeira tarefa à última, incluindo o dia do evento', () => {
    const lista = [tarefa('x', { inicio: '2026-10-20', fim: '2026-10-21' }), tarefa('y', { inicio: '2026-12-01', fim: '2026-12-10' })];
    expect(intervaloDeMeses(lista, '2026-11-10')).toEqual({ primeiro: '2026-10', ultimo: '2026-12' });
    expect(intervaloDeMeses([], '2026-11-10')).toEqual({ primeiro: '2026-11', ultimo: '2026-11' });
  });
});
