import type pg from 'pg';
import { formatarData, hojeEmLuanda } from '../../shared/datas.js';
import type { CodigoPlano } from '../../shared/esquemas.js';
import { mensagens } from '../../shared/mensagens.js';
import { DIAS_AVISO, DIAS_TOLERANCIA, descidaDoPlano } from '../../shared/pagamentos.js';
import type { Config } from '../config.js';
import { auditar } from '../contas/auditoria.js';
import { emTransaccao } from '../db/index.js';
import type { EnviarEmail } from '../email/index.js';
import { emailPlanoAcaba, emailPlanoAcabou, emailPlanoExpirado } from '../email/modelos.js';

// Fim do período pago (decisão 030), verificado de hora a hora:
//  - 7 dias antes do fim, e no dia do fim, um e-mail ao dono;
//  - 7 dias depois do fim (tolerância), o espaço volta ao Singular, com e-mail ao dono.
// Enquanto houver um comprovativo por confirmar, não se avisa nem se desce: o atraso é nosso, não do cliente.
// Pode correr em mais de uma instância ao mesmo tempo: cada aviso fica registado (plan_notices) antes de sair,
// e a descida bloqueia o espaço e volta a verificar a data.

const dataLuanda = (d: Date) => formatarData(hojeEmLuanda(d));

interface Espaco {
  id: string;
  name: string;
  plan_code: Exclude<CodigoPlano, 'singular'>;
  plan_ends_at: Date;
  dono: string | null;
}

const COM_DONO = `w.id, w.name, w.plan_code, w.plan_ends_at,
  (select u.email from workspace_members wm join users u on u.id = wm.user_id where wm.workspace_id = w.id and wm.role = 'owner' limit 1) as dono`;
const SEM_COMPROVATIVO_POR_CONFIRMAR = `not exists (select 1 from payments p where p.workspace_id = w.id and p.status = 'pending')`;

// Regista o aviso; devolve true só a quem o registou primeiro (esse é que envia o e-mail).
async function registarAviso(pool: pg.Pool, espaco: Espaco, tipo: 'antes' | 'fim'): Promise<boolean> {
  const { rowCount } = await pool.query('insert into plan_notices (workspace_id, plan_ends_at, kind) values ($1, $2, $3) on conflict do nothing', [
    espaco.id,
    espaco.plan_ends_at,
    tipo,
  ]);
  return rowCount === 1;
}

export async function verificarPlanos(pool: pg.Pool, config: Config, enviarEmail: EnviarEmail, agora = new Date()) {
  const url = `${config.APP_URL}/conta/plano`;
  const resultado = { avisosAntes: 0, avisosFim: 0, descidas: 0 };

  // Faltam 7 dias ou menos.
  const { rows: aAcabar } = await pool.query<Espaco>(
    `select ${COM_DONO} from workspaces w
      where w.plan_ends_at is not null and w.plan_ends_at > $1 and w.plan_ends_at <= $1 + make_interval(days => $2)
        and ${SEM_COMPROVATIVO_POR_CONFIRMAR}`,
    [agora, DIAS_AVISO],
  );
  for (const w of aAcabar) {
    if (!(await registarAviso(pool, w, 'antes'))) continue;
    resultado.avisosAntes++;
    if (w.dono) enviarEmail(emailPlanoAcaba(w.dono, url, w.name, mensagens.planos[w.plan_code], dataLuanda(w.plan_ends_at)));
  }

  // Já acabou, ainda dentro da tolerância.
  const { rows: acabados } = await pool.query<Espaco>(
    `select ${COM_DONO} from workspaces w
      where w.plan_ends_at is not null and w.plan_ends_at <= $1 and w.plan_ends_at + make_interval(days => $2) > $1
        and ${SEM_COMPROVATIVO_POR_CONFIRMAR}`,
    [agora, DIAS_TOLERANCIA],
  );
  for (const w of acabados) {
    if (!(await registarAviso(pool, w, 'fim'))) continue;
    resultado.avisosFim++;
    if (w.dono) enviarEmail(emailPlanoAcabou(w.dono, url, w.name, mensagens.planos[w.plan_code], dataLuanda(descidaDoPlano(w.plan_ends_at))));
  }

  // Passou a tolerância: volta ao Singular. Cada espaço na sua transacção, bloqueado e verificado de novo
  // (pode ter sido renovado, ou mudado à mão, entretanto).
  const { rows: expirados } = await pool.query<{ id: string }>(
    `select w.id from workspaces w
      where w.plan_ends_at is not null and w.plan_ends_at + make_interval(days => $2) <= $1 and ${SEM_COMPROVATIVO_POR_CONFIRMAR}`,
    [agora, DIAS_TOLERANCIA],
  );
  for (const { id } of expirados) {
    const desceu = await emTransaccao(pool, async (cliente) => {
      const { rows } = await cliente.query<Espaco>(
        `select ${COM_DONO} from workspaces w
          where w.id = $1 and w.plan_ends_at is not null and w.plan_ends_at + make_interval(days => $3) <= $2
            and ${SEM_COMPROVATIVO_POR_CONFIRMAR}
          for update of w`,
        [id, agora, DIAS_TOLERANCIA],
      );
      const w = rows[0];
      if (!w) return null;
      await cliente.query("update workspaces set plan_code = 'singular', plan_started_at = now(), plan_ends_at = null where id = $1", [id]);
      await auditar(cliente, 'plano.expirado', { espacoId: id, detalhes: { de: w.plan_code, fim: w.plan_ends_at.toISOString() } });
      return w;
    });
    if (!desceu) continue;
    resultado.descidas++;
    if (desceu.dono) enviarEmail(emailPlanoExpirado(desceu.dono, url, desceu.name, mensagens.planos[desceu.plan_code]));
  }
  return resultado;
}
