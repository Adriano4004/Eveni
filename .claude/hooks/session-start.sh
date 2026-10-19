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
