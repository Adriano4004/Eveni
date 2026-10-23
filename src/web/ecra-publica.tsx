import { mensagens } from '../shared/mensagens.js';
import { navegar } from './navegacao.js';

const q = mensagens.publica;
const l = mensagens.legal;

// Botão que é uma ligação: abre o ecrã sem recarregar a página.
function BotaoLigacao({ para, classe, children }: { para: string; classe: string; children: string }) {
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

// Página pública (decisão 028): o que se vê sem sessão iniciada. A peça central é a contagem decrescente
// até ao dia do evento, que é a forma como o Eveni pensa cada plano (D-90, D-30, D0).
export function EcraPublica() {
  return (
    <div className="publica">
      <header className="publica__topo">
        <img className="publica__logo" src="/eveni-logo.png" alt={mensagens.app.nome} width={160} height={62} />
        <BotaoLigacao para="/entrar" classe="publica__entrar">
          {q.entrar}
        </BotaoLigacao>
      </header>

      <main>
        <section className="abertura">
          <div className="abertura__texto">
            <h1>{q.titulo}</h1>
            <p className="abertura__sub">{q.subtitulo}</p>
            <div className="abertura__accoes">
              <BotaoLigacao para="/registo" classe="publica__botao">
                {q.criarConta}
              </BotaoLigacao>
              <BotaoLigacao para="/entrar" classe="publica__secundario">
                {q.jaTenhoConta}
              </BotaoLigacao>
            </div>
          </div>
          <figure className="contagem">
            <figcaption>{q.contagem.titulo}</figcaption>
            <ol>
              {q.contagem.paragens.map((p, i) => (
                <li key={p.dia} className={p.dia === 'D0' ? 'contagem__dia contagem__dia--d0' : 'contagem__dia'} style={{ animationDelay: `${i * 120}ms` }}>
                  <span className="contagem__marca">{p.dia}</span>
                  <span className="contagem__tarefa">{p.tarefa}</span>
                </li>
              ))}
            </ol>
          </figure>
        </section>

        <section className="publica__seccao">
          <h2>{q.tipos.titulo}</h2>
          <p className="publica__texto">{q.tipos.texto}</p>
          <ul className="tipos">
            {q.tipos.lista.map((t) => (
              <li key={t.codigo} className="tipo">
                <div className="tipo__cabeca">
                  <strong>{t.nome}</strong>
                  <span className="tipo__para">{t.para}</span>
                </div>
                {/* A barra mostra o horizonte do plano: de 3 semanas (conferência de imprensa) a 1 ano (casamento). */}
                <div className="tipo__horizonte" aria-hidden="true">
                  <span style={{ width: `${Math.max(6, Math.round((t.dias / 365) * 100))}%` }} />
                </div>
                <span className="tipo__numeros">
                  {q.tipos.prazo(t.dias)}, {q.tipos.tarefas(t.tarefas)}
                </span>
              </li>
            ))}
          </ul>
          <p className="publica__texto publica__texto--nota">{q.tipos.comPouco}</p>
        </section>

        <section className="publica__seccao notas-publicas">
          <h2>{q.notas.titulo}</h2>
          <p className="publica__texto">{q.notas.texto}</p>
          <ul>
            {q.notas.lista.map((n) => (
              <li key={n.tarefa}>
                <p className="notas-publicas__tarefa">
                  <span className="notas-publicas__dia">{n.dia}</span> {n.tarefa}
                </p>
                <blockquote>{n.nota}</blockquote>
              </li>
            ))}
          </ul>
        </section>

        <section className="publica__seccao">
          <h2>{q.resto.titulo}</h2>
          <dl className="resto">
            {q.resto.lista.map((r) => (
              <div key={r.titulo}>
                <dt>{r.titulo}</dt>
                <dd>{r.texto}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="publica__seccao">
          <h2>{q.planos.titulo}</h2>
          <ul className="planos-publicos">
            {q.planos.lista.map((p) => (
              <li key={p.nome}>
                <h3>{p.nome}</h3>
                <p className="planos-publicos__preco">{p.preco}</p>
                <p>{p.detalhe}</p>
              </li>
            ))}
          </ul>
          <p className="publica__texto publica__texto--nota">{q.planos.nota}</p>
        </section>

        <section className="fim">
          <h2>{q.fim.titulo}</h2>
          <p>{q.fim.texto}</p>
          <BotaoLigacao para="/registo" classe="publica__botao publica__botao--claro">
            {q.criarConta}
          </BotaoLigacao>
        </section>
      </main>

      <footer className="publica__rodape">
        <nav>
          <BotaoLigacao para="/termos" classe="">
            {l.termos.ligacao}
          </BotaoLigacao>
          <BotaoLigacao para="/privacidade" classe="">
            {l.privacidade.ligacao}
          </BotaoLigacao>
        </nav>
        <p>{q.rodape(new Date().getFullYear())}</p>
      </footer>
    </div>
  );
}
