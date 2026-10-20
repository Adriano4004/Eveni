import type pg from 'pg';
import { mensagens } from '../../shared/mensagens.js';
import type { EstadoProjecto, PapelNoProjecto } from '../../shared/projectos.js';
import { ErroHttp } from '../erros.js';

const mp = mensagens.projectos;

// Bloqueia o projecto e verifica que a pessoa o pode alterar (dono ou editor, com o projecto activo).
// Primeiro o projecto, depois as linhas dele (convidados, mesas, rubricas): a mesma ordem das tarefas.
// Com o projecto bloqueado, as verificações de repetidos e de limites não são ultrapassadas por outro
// pedido em simultâneo.
export async function projectoParaAlterar(cliente: pg.PoolClient, projectoId: string, utilizadorId: string) {
  const { rows } = await cliente.query<{ status: EstadoProjecto; papel: PapelNoProjecto | null }>(
    'select p.status, papel_no_projecto(p.id, $2) as papel from projects p where p.id = $1 for update of p',
    [projectoId, utilizadorId],
  );
  const projecto = rows[0];
  if (!projecto?.papel) throw new ErroHttp(404, mp.naoEncontrado);
  if (projecto.papel === 'viewer') throw new ErroHttp(403, mp.soLeitura);
  if (projecto.status === 'archived') throw new ErroHttp(409, mp.arquivado);
}
