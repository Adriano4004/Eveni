import { useEffect, useId, useState } from 'react';
import { formatarData, hojeEmLuanda } from '../shared/datas.js';
import { formatarKz } from '../shared/dinheiro.js';
import { mensagens } from '../shared/mensagens.js';
import {
  CONTA_BANCARIA,
  DESCONTO_ANUAL_PCT,
  DIAS_AVISO,
  descidaDoPlano,
  MAX_BYTES_COMPROVATIVO,
  type Pagamento,
  PERIODOS,
  PLANOS_PAGOS,
  type SituacaoPlano,
  valorDoPagamento,
} from '../shared/pagamentos.js';
import { api, mensagemDeErro } from './api.js';
import { Logo } from './ecras.js';
import { Formulario } from './Formulario.js';
import { navegar } from './navegacao.js';

const q = mensagens.pagamentos;
const dataLuanda = (iso: string) => formatarData(hojeEmLuanda(new Date(iso)));

// Lê o ficheiro escolhido como "data:…;base64,…", o formato que a API recebe.
const lerFicheiro = (ficheiro: File) =>
  new Promise<string>((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result));
    leitor.onerror = () => rejeitar(leitor.error);
    leitor.readAsDataURL(ficheiro);
  });

// Plano e pagamentos (decisão 029): pedir um plano, pagar por transferência e enviar o comprovativo.
export function EcraPlano() {
  const [situacao, setSituacao] = useState<SituacaoPlano>();
  const [erro, setErro] = useState<string>();

  useEffect(() => {
    api<SituacaoPlano>('GET', '/api/pagamentos').then(setSituacao, (e) => setErro(mensagemDeErro(e)));
  }, []);

  return (
    <main className="cartao">
      <Logo />
      <h1>{q.titulo}</h1>
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}
      {situacao && (
        <>
          <dl className="detalhes">
            <div>
              <dt>{q.planoActual}</dt>
              <dd>
                {mensagens.planos[situacao.plano]} · {situacao.fim ? q.ate(dataLuanda(situacao.fim)) : q.semFim}
              </dd>
            </div>
          </dl>
          {situacao.fim && <AvisoFim fim={new Date(situacao.fim)} />}
          {situacao.emAberto ? (
            <PagamentoEmAberto pagamento={situacao.emAberto} aoMudar={setSituacao} />
          ) : (
            <EscolherPlano actual={situacao.plano} aoPedir={setSituacao} />
          )}
          <p className="campo__ajuda">{q.facturas}</p>
          {situacao.historico.length > 0 && (
            <section>
              <h2>{q.historico}</h2>
              <ul className="convidados">
                {situacao.historico.map((p) => (
                  <li key={p.id} className="convidado">
                    <span className="convidado__nome">
                      {p.referencia} · {mensagens.planos[p.plano]}, {q.periodos[p.periodo].toLowerCase()}
                    </span>
                    <span className="etiqueta">{q.estados[p.estado]}</span>
                    <span className="campo__ajuda convidado__detalhe">
                      {formatarKz(p.valorCentimos)}
                      {p.inicio && p.fim && ` · ${q.periodoPago(dataLuanda(p.inicio), dataLuanda(p.fim))}`}
                      {p.motivoRecusa && ` · ${q.motivo(p.motivoRecusa)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <button className="botao botao--secundario" type="button" onClick={() => navegar('/')}>
        {q.voltar}
      </button>
    </main>
  );
}

// A partir de 7 dias antes do fim (decisão 030): quando acaba, ou quando volta ao Singular se não renovar.
export function AvisoFim({ fim }: { fim: Date }) {
  const agora = Date.now();
  if (fim.getTime() - agora > DIAS_AVISO * 24 * 60 * 60 * 1000) return null;
  return (
    <p className="aviso aviso--alerta" role="status">
      {fim.getTime() > agora ? q.acabaEm(dataLuanda(fim.toISOString())) : q.acabou(dataLuanda(descidaDoPlano(fim).toISOString()))}
    </p>
  );
}

function EscolherPlano({ actual, aoPedir }: { actual: SituacaoPlano['plano']; aoPedir: (s: SituacaoPlano) => void }) {
  return (
    <section>
      <h2>{q.escolher}</h2>
      <p className="campo__ajuda">{q.escolherTexto}</p>
      <Formulario botao={q.pedir} aEnviar={q.aPedir} enviar={async (dados) => aoPedir(await api<SituacaoPlano>('POST', '/api/pagamentos', dados))}>
        {(erros) => (
          <>
            <fieldset className="escolhas">
              <legend>{q.plano}</legend>
              {PLANOS_PAGOS.map((p, i) => (
                <label key={p} className="escolha">
                  <input type="radio" name="plano" value={p} defaultChecked={actual === 'singular' ? i === 0 : p === actual} />
                  <span>
                    <strong>{mensagens.planos[p]}</strong>
                    <span className="campo__ajuda">
                      {formatarKz(valorDoPagamento(p, 'monthly'))} {q.porPeriodo.monthly}
                    </span>
                  </span>
                </label>
              ))}
              {erros.plano && <p className="campo__erro">{erros.plano}</p>}
            </fieldset>
            <fieldset className="escolhas">
              <legend>{q.periodo}</legend>
              {PERIODOS.map((p, i) => (
                <label key={p} className="escolha">
                  <input type="radio" name="periodo" value={p} defaultChecked={i === 0} />
                  <span>
                    <strong>{q.periodos[p]}</strong>
                    {p === 'yearly' && <span className="campo__ajuda">{q.descontoAnual(DESCONTO_ANUAL_PCT)}</span>}
                  </span>
                </label>
              ))}
              {erros.periodo && <p className="campo__erro">{erros.periodo}</p>}
            </fieldset>
          </>
        )}
      </Formulario>
    </section>
  );
}

function PagamentoEmAberto({ pagamento: p, aoMudar }: { pagamento: Pagamento; aoMudar: (s: SituacaoPlano) => void }) {
  const [erro, setErro] = useState<string>();
  const [aEnviar, setAEnviar] = useState(false);
  const [aCancelar, setACancelar] = useState(false);
  const idFicheiro = useId();

  async function enviar(ficheiro: File | undefined) {
    if (!ficheiro) return;
    setErro(undefined);
    if (ficheiro.size > MAX_BYTES_COMPROVATIVO) {
      setErro(mensagens.validacao.comprovativoGrande);
      return;
    }
    setAEnviar(true);
    try {
      aoMudar(await api<SituacaoPlano>('POST', `/api/pagamentos/${p.id}/comprovativo`, { ficheiro: await lerFicheiro(ficheiro) }));
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setAEnviar(false);
    }
  }

  async function cancelar() {
    if (!window.confirm(q.confirmarCancelar)) return;
    setErro(undefined);
    setACancelar(true);
    try {
      aoMudar(await api<SituacaoPlano>('POST', `/api/pagamentos/${p.id}/cancelar`));
    } catch (falha) {
      setErro(mensagemDeErro(falha));
      setACancelar(false);
    }
  }

  return (
    <section>
      <h2>{q.instrucoesTitulo}</h2>
      <p>{q.pedido(mensagens.planos[p.plano], q.periodos[p.periodo])}</p>
      {p.estado === 'pending' ? (
        <p className="sucesso" role="status">
          {q.porConfirmar}
        </p>
      ) : (
        <p className="campo__ajuda">{q.instrucoes}</p>
      )}
      <dl className="detalhes">
        <div>
          <dt>{q.valor}</dt>
          <dd>{formatarKz(p.valorCentimos)}</dd>
        </div>
        <div>
          <dt>{q.referencia}</dt>
          <dd>
            <strong>{p.referencia}</strong>
          </dd>
        </div>
        <div>
          <dt>{q.titular}</dt>
          <dd>{CONTA_BANCARIA.titular}</dd>
        </div>
        <div>
          <dt>{q.banco}</dt>
          <dd>{CONTA_BANCARIA.banco}</dd>
        </div>
        <div>
          <dt>{q.conta}</dt>
          <dd>{CONTA_BANCARIA.conta}</dd>
        </div>
        <div>
          <dt>{q.iban}</dt>
          <dd>{CONTA_BANCARIA.iban}</dd>
        </div>
      </dl>
      {erro && (
        <p className="formulario__erro" role="alert">
          {erro}
        </p>
      )}
      <div className="campo">
        <label htmlFor={idFicheiro} className="botao botao--ficheiro">
          {aEnviar ? q.aEnviar : p.temComprovativo ? q.substituir : q.enviar}
        </label>
        <input
          id={idFicheiro}
          className="so-leitores-de-ecra"
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          disabled={aEnviar}
          onChange={(ev) => {
            void enviar(ev.target.files?.[0]);
            ev.target.value = '';
          }}
        />
        <p className="campo__ajuda">{q.comprovativo}</p>
      </div>
      <button className="botao botao--secundario" type="button" onClick={cancelar} disabled={aCancelar}>
        {aCancelar ? q.aCancelar : q.cancelar}
      </button>
    </section>
  );
}
