// Escreve data/templates/*.json a partir do Excel. Uso: npm run templates:converter
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { converter, PASTA_DADOS, serializar } from './converter-templates.js';

const { taxonomia, templates } = await converter();
mkdirSync(PASTA_DADOS, { recursive: true });
// Apagar ficheiros de templates que já não existem no Excel.
const actuais = new Set(templates.map((t) => `${t.codigo}.json`));
for (const ficheiro of readdirSync(PASTA_DADOS)) {
  if (/^T\d{2}\.json$/.test(ficheiro) && !actuais.has(ficheiro)) rmSync(join(PASTA_DADOS, ficheiro));
}
writeFileSync(join(PASTA_DADOS, 'taxonomia.json'), serializar(taxonomia));
for (const t of templates) writeFileSync(join(PASTA_DADOS, `${t.codigo}.json`), serializar(t));
console.log(`Templates convertidos: ${templates.map((t) => `${t.codigo} (${t.tarefas.length} tarefas)`).join(', ')}`);
