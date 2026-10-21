import { useEffect, useId, useState } from 'react';
import { type Marca, MAX_BYTES_LOGO } from '../shared/marca.js';
import { mensagens } from '../shared/mensagens.js';
import { api, mensagemDeErro } from './api.js';
import { Campo } from './Campo.js';
import { Formulario } from './Formulario.js';
import { navegar } from './navegacao.js';

const q = mensagens.ecras.marca;

// Marca da agência nos relatórios PDF (decisão 020): só o dono, no seu espaço; só nos planos Empresarial e Grandes.
export function EcraMarca() {
  const [marca, setMarca] = useState<Marca>();
  const [erro, setErro] = useState<string>();
  const [guardado, setGuardado] = useState(false);
  // Muda a cada logótipo novo, para o browser não mostrar o anterior.
  const [versao, setVersao] = useState(0);
  const [aEnviar, setAEnviar] = useState(false);
  const idLogo = useId();

  useEffect(() => {
    api<Marca>('GET', '/api/marca')
      .then(setMarca)
      .catch((falha) => setErro(mensagemDeErro(falha)));
  }, []);

  async function enviarLogo(ficheiro: File | undefined) {
    if (!ficheiro) return;
    setErro(undefined);
    if (!['image/png', 'image/jpeg'].includes(ficheiro.type)) return setErro(q.logoTipo);
    if (ficheiro.size > MAX_BYTES_LOGO) return setErro(q.logoGrande);
    setAEnviar(true);
    try {
      const imagem = await new Promise<string>((resolver, rejeitar) => {
        const leitor = new FileReader();
        leitor.onload = () => resolver(String(leitor.result));
        leitor.onerror = () => rejeitar(leitor.error);
        leitor.readAsDataURL(ficheiro);
      });
      setMarca(await api<Marca>('POST', '/api/marca/logo', { imagem }));
      setVersao((v) => v + 1);
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    } finally {
      setAEnviar(false);
    }
  }

  async function removerLogo() {
    setErro(undefined);
    try {
      setMarca(await api<Marca>('POST', '/api/marca/logo/remover'));
    } catch (falha) {
      setErro(mensagemDeErro(falha));
    }
  }

  const voltar = (
    <button className="botao botao--secundario botao--compacto" type="button" onClick={() => navegar('/')}>
      {q.voltar}
    </button>
  );
  const mostrarErro = erro && (
    <p className="formulario__erro" role="alert">
      {erro}
    </p>
  );
  if (!marca) {
    return (
      <main className="cartao">
        {voltar}
        {mostrarErro || <p className="a-carregar">{q.carregar}</p>}
      </main>
    );
  }

  return (
    <main className="cartao">
      {voltar}
      <h1>{q.titulo}</h1>
      <p className="campo__ajuda">{q.texto}</p>
      {mostrarErro}
      {!marca.disponivel ? (
        <p className="aviso">{q.indisponivel}</p>
      ) : (
        <>
          <section className="seccao" aria-labelledby="titulo-logo">
            <h2 id="titulo-logo">{q.logo}</h2>
            <p className="campo__ajuda">{q.logoTexto}</p>
            {marca.temLogo ? (
              <img className="previa-logo" src={`/api/marca/logo?v=${versao}`} alt={q.previsualizacao} />
            ) : (
              <p className="campo__ajuda">{q.semLogo}</p>
            )}
            <label className="botao botao--secundario botao--ficheiro" htmlFor={idLogo}>
              {aEnviar ? q.aEnviar : q.escolherLogo}
            </label>
            <input
              id={idLogo}
              className="so-leitores-de-ecra"
              type="file"
              accept="image/png,image/jpeg"
              disabled={aEnviar}
              onChange={(ev) => {
                enviarLogo(ev.target.files?.[0]);
                ev.target.value = '';
              }}
            />
            {marca.temLogo && (
              <button className="botao botao--secundario botao--compacto" type="button" onClick={removerLogo}>
                {q.removerLogo}
              </button>
            )}
          </section>
          <section className="seccao" aria-labelledby="titulo-cor">
            <h2 id="titulo-cor">{q.corERodape}</h2>
            {guardado && (
              <p className="sucesso" role="status">
                {q.guardado}
              </p>
            )}
            <Formulario
              botao={q.guardar}
              aEnviar={q.aGuardar}
              enviar={async (dados) => {
                setGuardado(false);
                setMarca(await api<Marca>('POST', '/api/marca', dados));
                setGuardado(true);
              }}
            >
              {(erros) => (
                <>
                  <EscolhaCor valor={marca.cor} erro={erros.cor} />
                  <Campo rotulo={q.rodape} nome="rodape" autoComplete="off" opcional erro={erros.rodape} ajuda={q.ajudaRodape} valorInicial={marca.rodape ?? ''} />
                </>
              )}
            </Formulario>
          </section>
        </>
      )}
    </main>
  );
}

// Cor: o selector de cores do telemóvel e, ao lado, o código (#rrggbb), que se pode apagar.
function EscolhaCor({ valor, erro }: { valor: string | null; erro?: string }) {
  const id = useId();
  const [cor, setCor] = useState(valor ?? '');
  return (
    <div className="campo">
      <label htmlFor={id}>{q.cor}</label>
      <div className="escolha-cor">
        <input type="color" aria-label={q.seletorCor} value={cor || '#6553f3'} onChange={(ev) => setCor(ev.target.value)} />
        <input id={id} name="cor" type="text" autoComplete="off" value={cor} onChange={(ev) => setCor(ev.target.value)} aria-invalid={erro ? true : undefined} />
      </div>
      <p className={erro ? 'campo__erro' : 'campo__ajuda'}>{erro ?? q.ajudaCor}</p>
    </div>
  );
}
