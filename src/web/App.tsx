import { mensagens } from '../shared/mensagens.js';

export function App() {
  return (
    <main className="inicio">
      <img className="inicio__logo" src="/eveni-logo.png" alt={`${mensagens.app.nome} — ${mensagens.app.slogan}`} width={320} height={320} />
      <h1 className="inicio__titulo">{mensagens.app.emConstrucao}</h1>
      <p className="inicio__texto">{mensagens.app.emConstrucaoDetalhe}</p>
    </main>
  );
}
