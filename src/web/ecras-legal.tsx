import { useState } from 'react';
import type { Eu } from '../shared/esquemas.js';
import { formatarData } from '../shared/datas.js';
import { type SeccaoLegal, VERSAO_TERMOS } from '../shared/legal.js';
import { mensagens } from '../shared/mensagens.js';
import { api } from './api.js';
import { Ligacao, Logo } from './ecras.js';
import { Formulario } from './Formulario.js';
import { navegar } from './navegacao.js';

const l = mensagens.legal;

// Ligações para os termos e a política de privacidade, no fundo dos ecrãs de entrada, registo e RSVP.
export function LigacoesLegais() {
  return (
    <p className="cartao__rodape legal__ligacoes">
      <Ligacao para="/termos">{l.termos.ligacao}</Ligacao>
      {' · '}
      <Ligacao para="/privacidade">{l.privacidade.ligacao}</Ligacao>
    </p>
  );
}

// Ligação que abre noutro separador: no meio de um formulário, sem perder o que já foi escrito.
function LigacaoNovoSeparador({ para, children }: { para: string; children: string }) {
  return (
    <a href={para} target="_blank" rel="noopener">
      {children}
    </a>
  );
}

// A frase "Tenho 18 anos ou mais e aceito os termos… e a política…", com as duas ligações.
function FraseAceitacao({ frase }: { frase: readonly [string, string, string] }) {
  return (
    <span className="frase-aceitacao">
      {frase[0]}
      <LigacaoNovoSeparador para="/termos">{l.termos.titulo.toLowerCase()}</LigacaoNovoSeparador>
      {frase[1]}
      <LigacaoNovoSeparador para="/privacidade">{l.privacidade.titulo.toLowerCase()}</LigacaoNovoSeparador>
      {frase[2]}
    </span>
  );
}

export function CaixaAceitarTermos({ erro }: { erro?: string }) {
  return (
    <div className="campo">
      <label className="escolha">
        <input type="checkbox" name="aceitarTermos" aria-invalid={erro ? true : undefined} />
        <FraseAceitacao frase={mensagens.ecras.registo.aceito} />
      </label>
      {erro && <p className="campo__erro">{erro}</p>}
    </div>
  );
}

// Páginas públicas: abrem-se com ou sem sessão (e a partir da página de RSVP dos convidados).
export function EcraLegal({ tipo }: { tipo: 'privacidade' | 'termos' }) {
  const documento = l[tipo];
  const outro = tipo === 'privacidade' ? l.termos : l.privacidade;
  return (
    <main className="cartao legal">
      <Logo />
      <h1>{documento.titulo}</h1>
      <p className="cartao__subtitulo">{l.versao(formatarData(VERSAO_TERMOS))}</p>
      {documento.seccoes.map((s: SeccaoLegal) => (
        <section key={s.titulo}>
          <h2>{s.titulo}</h2>
          {s.paragrafos.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
      <p className="cartao__rodape">
        <Ligacao para={tipo === 'privacidade' ? '/termos' : '/privacidade'}>{outro.ligacao}</Ligacao>
      </p>
      <p className="cartao__rodape cartao__rodape--junto">
        <a
          href="/"
          onClick={(evento) => {
            evento.preventDefault();
            if (history.length > 1) history.back();
            else navegar('/');
          }}
        >
          {l.voltar}
        </a>
      </p>
    </main>
  );
}

// Com sessão, mas a versão actual dos termos ainda não foi aceite (decisão 026): nada mais se abre até aceitar.
export function EcraNovosTermos({ aoAceitar, aoSair }: { aoAceitar: (eu: Eu) => void; aoSair: () => void }) {
  const n = l.novos;
  const [aSair, setASair] = useState(false);
  return (
    <main className="cartao">
      <Logo />
      <h1>{n.titulo}</h1>
      <p className="cartao__subtitulo">{n.texto}</p>
      <Formulario
        botao={n.botao}
        aEnviar={n.aEnviar}
        enviar={async (dados) => aoAceitar(await api<Eu>('POST', '/api/conta/aceitar-termos', { ...dados, versao: VERSAO_TERMOS }))}
      >
        {(erros) => (
          <div className="campo">
            <label className="escolha">
              <input type="checkbox" name="aceitarTermos" />
              <FraseAceitacao frase={n.aceito} />
            </label>
            {(erros.aceitarTermos || erros.versao) && <p className="campo__erro">{erros.aceitarTermos ?? erros.versao}</p>}
          </div>
        )}
      </Formulario>
      <p className="cartao__rodape">
        {n.outrasOpcoes} <Ligacao para="/conta/dados">{n.osMeusDados}</Ligacao>.
      </p>
      <p className="cartao__rodape cartao__rodape--junto">
        <button
          className="botao botao--secundario"
          type="button"
          disabled={aSair}
          onClick={async () => {
            setASair(true);
            try {
              await api('POST', '/api/auth/sair');
            } finally {
              aoSair();
            }
          }}
        >
          {n.sair}
        </button>
      </p>
    </main>
  );
}
