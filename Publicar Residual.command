#!/bin/zsh
# Publica o sistema da Residual no GitHub Pages (https://ragcodebr.github.io/sistema-residual/)
cd "$(dirname "$0")" || exit 1
echo "Publicando o sistema da Residual..."
npm run deploy:pages
echo
echo "Pronto. Pode fechar esta janela."
read -k 1 "?Pressione qualquer tecla para sair..."
