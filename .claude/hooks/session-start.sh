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
