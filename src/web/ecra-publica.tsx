import type { ReactNode } from 'react';
import { mensagens } from '../shared/mensagens.js';
import { navegar } from './navegacao.js';

const q = mensagens.publica;
const l = mensagens.legal;

// Fotografias da página pública (decisão 028), em public/fotos/: geradas por IA, fornecidas pelo Adriano a
// 23/10/2026. Enquanto um lugar não tem foto (null), fica com um fundo de cor da marca.
const FOTOS: { topo: string | null; tipos: Record<string, string | null>; fim: (string | null)[] } = {
  topo: '/fotos/topo-conferencia.webp',
  tipos: {
    T01: '/fotos/conferencia-imprensa.webp',
    T02: '/fotos/casamento-planner.webp',
    T03: '/fotos/congresso-credenciacao.webp',
    T04: '/fotos/festival-publico.webp',
    T05: '/fotos/forum-painel.webp',
    T06: '/fotos/conferencia-palco.webp',
    T07: '/fotos/festa-mesa.webp',
  },
  fim: ['/fotos/festa-mesa.webp', '/fotos/congresso-credenciacao.webp', '/fotos/casamento-planner.webp'],
};

// Botão que é uma ligação: abre o ecrã sem recarregar a página.
function Ligacao({ para, classe, children }: { para: string; classe?: string; children: ReactNode }) {
  return (
    <a
      className={classe}
      href={para}
      onClick={(evento) => {
        evento.preventDefault();
        navegar(para);
      }}
    >
      {children}
    </a>
  );
}

// Uma fotografia, ou o fundo de cor que a substitui enquanto não existe.
function Foto({ src, classe, tom = 0, logo = false }: { src: string | null; classe: string; tom?: number; logo?: boolean }) {
  if (src) return <img className={`${classe} foto`} src={src} alt="" loading={logo ? 'eager' : 'lazy'} decoding="async" />;
  return <div className={`${classe} foto foto--vazia foto--tom${tom % 4}`} aria-hidden="true" />;
}

// O título do topo partido em duas linhas, como num cartaz.
function TituloAbertura() {
  const [antes, depois] = q.titulo.split('. ');
  return (
    <h1>
      <span>{antes}.</span> <span className="abertura__titulo-b">{depois}</span>
    </h1>
  );
}

// A contagem até ao dia D, como um bilhete de evento: tarefas reais do template de casamento.
function Bilhete() {
  const paragens = q.contagem.paragens.filter((p) => p.dia !== 'D0');
  const dia = q.contagem.paragens.find((p) => p.dia === 'D0')!;
  return (
    <figure className="bilhete">
      <div className="bilhete__corpo">
        <figcaption>{q.contagem.titulo}</figcaption>
        <ol>
          {paragens.map((p, i) => (
            <li key={p.dia} style={{ animationDelay: `${300 + i * 140}ms` }}>
              <span className="bilhete__dia">{p.dia}</span>
              <span>{p.tarefa}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="bilhete__talao" style={{ animationDelay: `${300 + paragens.length * 140}ms` }}>
        <span className="bilhete__d0">{dia.dia}</span>
        <span className="bilhete__grande">{dia.tarefa}</span>
      </div>
    </figure>
  );
}

// Página pública (decisão 028): o que se vê sem sessão iniciada.
export function EcraPublica() {
  const tipos = q.tipos.lista;
  return (
    <div className="publica">
      <section className="abertura">
        <Foto src={FOTOS.topo} classe="abertura__foto" tom={1} logo />
        <div className="abertura__veu" aria-hidden="true" />
        <header className="publica__topo">
          <img className="publica__logo" src="/eveni-logo.png" alt={mensagens.app.nome} width={140} height={54} />
          <Ligacao para="/entrar" classe="publica__entrar">
            {q.entrar}
          </Ligacao>
        </header>
        <div className="abertura__conteudo">
          <div className="abertura__texto">
            <TituloAbertura />
            <p className="abertura__sub">{q.subtitulo}</p>
            <div className="abertura__accoes">
              <Ligacao para="/registo" classe="pub-botao">
                {q.criarConta}
              </Ligacao>
              <Ligacao para="/entrar" classe="pub-botao pub-botao--fantasma">
                {q.jaTenhoConta}
              </Ligacao>
            </div>
          </div>
          <Bilhete />
        </div>
      </section>

      {/* Faixa a deslizar com os tipos de evento; a segunda cópia só serve para a volta não ter emenda. */}
      <div className="faixa">
        <div className="faixa__fita">
          {[0, 1].map((copia) => (
            <ul key={copia} aria-hidden={copia === 1 ? true : undefined}>
              {tipos.map((t) => (
                <li key={t.codigo}>{t.nome}</li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      <main>
        <section className="pub-seccao">
          <div className="pub-seccao__cabeca">
            <h2>{q.tipos.titulo}</h2>
            <p>{q.tipos.texto}</p>
          </div>
          <ul className="mosaico">
            {tipos.map((t, i) => (
              <li key={t.codigo} className={`mosaico__peca mosaico__peca--${t.codigo}`}>
                <Foto src={FOTOS.tipos[t.codigo] ?? null} classe="mosaico__foto" tom={i} />
                <div className="mosaico__legenda">
                  <strong>{t.nome}</strong>
                  <span>{t.para}</span>
                  <span className="mosaico__numeros">
                    {q.tipos.prazo(t.dias)}, {q.tipos.tarefas(t.tarefas)}
                  </span>
                  {/* O horizonte do plano: de 3 semanas (conferência de imprensa) a 1 ano (casamento). */}
                  <span className="mosaico__horizonte" aria-hidden="true">
                    <span style={{ width: `${Math.max(6, Math.round((t.dias / 365) * 100))}%` }} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="pub-seccao__nota">{q.tipos.comPouco}</p>
        </section>

        <section className="conversa">
          <div className="conversa__texto">
            <h2>{q.notas.titulo}</h2>
            <p>{q.notas.texto}</p>
          </div>
          <div className="conversa__ecra">
            {q.notas.lista.map((n) => (
              <div key={n.tarefa} className="conversa__mensagem">
                <p className="conversa__tarefa">
                  <span>{n.dia}</span> {n.tarefa}
                </p>
                <blockquote>{n.nota}</blockquote>
              </div>
            ))}
          </div>
        </section>

        <section className="pub-seccao">
          <div className="pub-seccao__cabeca">
            <h2>{q.resto.titulo}</h2>
          </div>
          <dl className="recursos">
            {q.resto.lista.map((r, i) => (
              <div key={r.titulo} className="recursos__item">
                <Icone indice={i} />
                <dt>{r.titulo}</dt>
                <dd>{r.texto}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="pub-seccao pub-seccao--planos">
          <div className="pub-seccao__cabeca">
            <h2>{q.planos.titulo}</h2>
          </div>
          <ul className="precos">
            {q.planos.lista.map((p, i) => (
              <li key={p.nome} className={i === 1 ? 'precos__plano precos__plano--destaque' : 'precos__plano'}>
                <h3>{p.nome}</h3>
                <p className="precos__valor">{p.preco}</p>
                <p>{p.detalhe}</p>
              </li>
            ))}
          </ul>
          <p className="pub-seccao__nota">
            {q.planos.nota} <a href={`mailto:${q.planos.contacto}`}>{q.planos.contacto}</a>
          </p>
        </section>

        <section className="fecho">
          <div className="fecho__texto">
            <h2>{q.fim.titulo}</h2>
            <p>{q.fim.texto}</p>
            <Ligacao para="/registo" classe="pub-botao">
              {q.criarConta}
            </Ligacao>
          </div>
          <div className="fecho__colagem">
            {FOTOS.fim.map((src, i) => (
              <Foto key={i} src={src} classe={`fecho__foto fecho__foto--${i}`} tom={i + 1} />
            ))}
          </div>
        </section>
      </main>

      <footer className="publica__rodape">
        <img className="publica__logo publica__logo--rodape" src="/eveni-logo.png" alt={mensagens.app.nome} width={120} height={46} />
        <nav>
          <a href={`mailto:${q.planos.contacto}`}>{q.planos.contacto}</a>
          <Ligacao para="/termos">{l.termos.ligacao}</Ligacao>
          <Ligacao para="/privacidade">{l.privacidade.ligacao}</Ligacao>
        </nav>
        <p>{q.rodape(new Date().getFullYear())}</p>
      </footer>
    </div>
  );
}

// Ícones simples, desenhados aqui (sem bibliotecas): conversa, moeda, equipa, documento.
function Icone({ indice }: { indice: number }) {
  const tracos = [
    <path key="c" d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H11l-4 3v-3H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />,
    <g key="m">
      <circle cx="12" cy="12" r="8" />
      <path d="M9 9v6M9 12l4-3M9 12l4 3" />
    </g>,
    <g key="e">
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M3 19c0-3 3-5 6-5s6 2 6 5M15 15c3 0 6 1.5 6 4" />
    </g>,
    <g key="d">
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5M10 13h6M10 17h6" />
    </g>,
  ];
  return (
    <svg className="recursos__icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {tracos[indice % tracos.length]}
    </svg>
  );
}
