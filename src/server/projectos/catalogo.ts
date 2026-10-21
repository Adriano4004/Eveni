import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResumoTemplate } from '../../shared/projectos.js';
import type { Template } from '../../shared/templates.js';
import { RAIZ } from '../raiz.js';

// Templates que se podem usar para criar projectos, pela ordem de lançamento combinada
// (docs/decisoes/011-templates.md): T01 → T03 → T04 → T02. Um template novo só entra aqui depois de lançado. O T03 foi lançado a 21/10/2026 (decisão 021), com o Fórum (T05) e a Conferência (T06),
// que derivam dele (decisão 022). O T04 e o T02 foram lançados a 21/10/2026 (decisões 023 e 024), e o
// Aniversário (T07), que deriva do T02 (decisão 025).
export const TEMPLATES_DISPONIVEIS = ['T01', 'T03', 'T05', 'T06', 'T04', 'T02', 'T07'] as const;

function carregar(codigo: string): Template {
  const template = JSON.parse(readFileSync(join(RAIZ, 'data', 'templates', `${codigo}.json`), 'utf8')) as Template;
  // Falha no arranque se o ficheiro não for o esperado, em vez de criar projectos partidos.
  if (template.codigo !== codigo || !template.versao || !Array.isArray(template.tarefas) || template.tarefas.length === 0) {
    throw new Error(`Template ${codigo} inválido em data/templates/`);
  }
  return template;
}

const templates = new Map<string, Template>(TEMPLATES_DISPONIVEIS.map((c) => [c, carregar(c)]));

export function obterTemplate(codigo: string): Template | undefined {
  return templates.get(codigo);
}

export function resumoTemplate(t: Template): ResumoTemplate {
  return {
    codigo: t.codigo,
    nome: t.nome,
    descricao: t.descricao,
    diasNecessarios: Math.max(0, ...t.tarefas.map((x) => -x.inicio)),
    tarefas: t.tarefas.length,
    criticas: t.tarefas.filter((x) => x.critica).length,
  };
}

export function listarTemplates(): ResumoTemplate[] {
  return [...templates.values()].map(resumoTemplate);
}
