#!/bin/bash
# Prepara o ambiente das sessões Claude Code na nuvem.
set -euo pipefail

# Só corre nas sessões remotas (claude.ai/code); localmente não faz nada.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Servidor de linguagem usado pelo plugin typescript-lsp.
if ! command -v typescript-language-server >/dev/null 2>&1; then
  npm install -g typescript-language-server typescript >/dev/null 2>&1
fi

# Nas sessões na nuvem só o marketplace oficial vem pré-instalado; o plugin
# superpowers (declarado em settings.json) precisa de ser instalado à mão.
if ! claude plugin marketplace list 2>/dev/null | grep -q superpowers-marketplace; then
  claude plugin marketplace add obra/superpowers-marketplace >/dev/null 2>&1 || true
fi
if [ ! -d "$HOME/.claude/plugins/cache/superpowers-marketplace/superpowers" ]; then
  claude plugin install superpowers@superpowers-marketplace >/dev/null 2>&1 || true
fi

# Dependências do projecto.
if [ -f "$CLAUDE_PROJECT_DIR/package-lock.json" ]; then
  (cd "$CLAUDE_PROJECT_DIR" && npm install --no-audit --no-fund >/dev/null 2>&1) || true
fi

# PostgreSQL local para os testes (nunca a base de dados de produção).
if command -v pg_ctlcluster >/dev/null 2>&1; then
  service postgresql start >/dev/null 2>&1 || true
  su postgres -c "psql -tAc \"select 1 from pg_roles where rolname='eveni'\"" 2>/dev/null | grep -q 1 \
    || su postgres -c "psql -q -c \"create user eveni with password 'eveni' createdb\"" >/dev/null 2>&1 || true
  su postgres -c "psql -tAc \"select 1 from pg_database where datname='eveni_test'\"" 2>/dev/null | grep -q 1 \
    || su postgres -c "psql -q -c 'create database eveni_test owner eveni'" >/dev/null 2>&1 || true
fi

# Os testes no browser usam o Chromium já instalado na sessão.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  chrome=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome 2>/dev/null | head -1 || true)
  if [ -n "$chrome" ]; then
    echo "export PLAYWRIGHT_CHROMIUM_PATH=$chrome" >> "$CLAUDE_ENV_FILE"
  fi
fi
