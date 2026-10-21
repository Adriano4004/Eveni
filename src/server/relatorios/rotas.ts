import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { calcularTotais } from '../../shared/convidados.js';
import { hojeEmLuanda } from '../../shared/datas.js';
import { mensagens } from '../../shared/mensagens.js';
import type { criarGuardas } from '../contas/acesso.js';
import { auditar } from '../contas/auditoria.js';
import { listarConvidados, listarMesas } from '../convidados/rotas.js';
import type { BaseDeDados } from '../db/index.js';
import { ErroHttp } from '../erros.js';
import { listarFornecedores } from '../fornecedores/rotas.js';
import { lerProjecto } from '../projectos/rotas.js';
import { LIMITES, limitar } from '../seguranca/limites.js';
import { desenharRelatorioCliente } from './cliente.js';
import { desenharCronograma } from './cronograma.js';
import { desenharRelatorioInterno } from './interno.js';
import { marcaParaPdf } from './marca.js';
import { montarRelatorioCliente, montarRelatorioCronograma, montarRelatorioInterno } from './modelo.js';

// Relatórios em PDF de um projecto (decisão 020). Só o dono e os editores os geram (os leitores não);
// também com o projecto arquivado (só lêem). Cada relatório gerado fica no registo de actividade do espaço.

const idProjecto = z.object({ id: z.uuid() });

// Nome do ficheiro só com letras simples (os acentos e espaços partem alguns telemóveis ao descarregar).
export function nomeDoFicheiro(projecto: string, tipo: string, dia: string): string {
  const simples = projecto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `eveni-${tipo}-${simples || 'projecto'}-${dia}.pdf`;
}

export function registarRotasRelatorios(app: FastifyInstance, base: BaseDeDados, guardas: ReturnType<typeof criarGuardas>) {
  const { pool } = base;

  // Um endereço por relatório: /api/projectos/<id>/relatorios/<tipo>.pdf.
  const TIPOS = { 'cliente.pdf': 'cliente', 'interno.pdf': 'interno', 'cronograma.pdf': 'cronograma' } as const;
  const parametrosRelatorio = z.object({ id: z.uuid(), ficheiro: z.enum(['cliente.pdf', 'interno.pdf', 'cronograma.pdf']) });

  app.get('/api/projectos/:id/relatorios/:ficheiro', { preHandler: guardas.exigirSessao }, async (pedido, resposta) => {
    const parametros = parametrosRelatorio.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, mensagens.projectos.naoEncontrado);
    const tipo = TIPOS[parametros.data.ficheiro];
    const { utilizadorId } = pedido.sessao!;
    await limitar(pool, `relatorios:${utilizadorId}`, LIMITES.relatorios);
    const projecto = await lerProjecto(pool, parametros.data.id, utilizadorId);
    if (!projecto) throw new ErroHttp(404, mensagens.projectos.naoEncontrado);
    if (projecto.papel === 'viewer') throw new ErroHttp(403, mensagens.relatorios.soDonoEEditores);

    const agora = new Date();
    const { rows } = await pool.query<{ workspace_id: string }>('select workspace_id from projects where id = $1', [projecto.id]);
    const espacoId = rows[0]!.workspace_id;
    // A marca da agência do espaço do projecto (planos Empresarial e Grandes), nos três relatórios.
    const marca = await marcaParaPdf(pool, espacoId);
    let pdf: Buffer;
    if (tipo === 'cronograma') {
      pdf = await desenharCronograma(montarRelatorioCronograma(projecto, agora), marca);
    } else {
      const convidados = await listarConvidados(pool, projecto.id);
      pdf =
        tipo === 'interno'
          ? await desenharRelatorioInterno(
              montarRelatorioInterno(projecto, convidados, await listarMesas(pool, projecto.id), await listarFornecedores(pool, espacoId), agora),
              marca,
            )
          : await desenharRelatorioCliente(montarRelatorioCliente(projecto, calcularTotais(convidados), agora), marca);
    }
    await auditar(pool, 'projecto.relatorio', { utilizadorId, ip: pedido.ip, espacoId, detalhes: { projectoId: projecto.id, tipo } });
    return resposta
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="${nomeDoFicheiro(projecto.nome, mensagens.relatorios[tipo].ficheiro, hojeEmLuanda(agora))}"`)
      .header('cache-control', 'no-store')
      .send(pdf);
  });
}
