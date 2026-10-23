import { describe, expect, it } from 'vitest';
import { listarTemplates } from '../src/server/projectos/catalogo.js';
import { mensagens } from '../src/shared/mensagens.js';

// A página pública (decisão 028) mostra os números dos templates escritos à mão: têm de bater certo.
describe('página pública', () => {
  it('lista todos os templates disponíveis, com o horizonte e o número de tarefas certos', () => {
    const lista = mensagens.publica.tipos.lista;
    const disponiveis = listarTemplates();
    expect(lista.map((t) => t.codigo).sort()).toEqual(disponiveis.map((t) => t.codigo).sort());
    for (const t of lista) {
      const real = disponiveis.find((d) => d.codigo === t.codigo)!;
      expect({ dias: t.dias, tarefas: t.tarefas }, t.codigo).toEqual({ dias: real.diasNecessarios, tarefas: real.tarefas });
    }
  });

  it('as notas citadas são as dos templates, palavra por palavra', async () => {
    const textos = new Set<string>();
    for (const c of ['T01', 'T02', 'T03', 'T04']) {
      const t = (await import(`../data/templates/${c}.json`, { with: { type: 'json' } })).default as { tarefas: { titulo: string; nota: string | null; inicio: number }[] };
      for (const x of t.tarefas) textos.add(`${x.inicio === 0 ? 'D0' : `D${x.inicio}`}|${x.titulo}|${x.nota}`);
    }
    for (const n of mensagens.publica.notas.lista) expect(textos.has(`${n.dia}|${n.tarefa}|${n.nota}`), n.tarefa).toBe(true);
  });

  it('os preços são os da decisão 003', () => {
    expect(mensagens.publica.planos.lista.map((p) => p.preco)).toEqual(['Grátis', '370 000,00 Kz por mês', '640 000,00 Kz por mês']);
  });
});
