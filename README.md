# Jarbas

Assistente pessoal do Alison: conversa por voz e texto, agenda própria com calendário, lembretes e respostas em voz.
Aplicativo web instalável (PWA), feito para o iPhone, hospedado de graça no GitHub Pages.

**Abrir:** https://arstoreltda-bot.github.io/Jarbas/

## Instalar no iPhone
1. Abra o endereço acima no **Safari**.
2. Toque em **Compartilhar** e depois em **Adicionar à Tela de Início**.
3. Deixe **Abrir como App Web** ligado e toque em **Adicionar**.
4. Abra o Jarbas pelo ícone novo.

## Cérebro (grátis)
O Jarbas usa a API do Google Gemini no plano gratuito. A chave é criada em https://aistudio.google.com/apikey
e fica guardada **só no aparelho** (nunca neste repositório).

## Onde ficam os dados
Tudo fica no próprio iPhone (armazenamento do app). Em Ajustes há backup (exportar/importar).

## Estrutura
- `index.html`, `styles.css`, `manifest.webmanifest`, `sw.js` (app offline)
- `js/util.js` datas, armazenamento · `js/gemini.js` IA · `js/voz.js` microfone e fala
- `js/agenda.js` agenda e lembretes · `js/cerebro.js` entende os pedidos · `js/app.js` telas
- `js/financas.js` base do futuro módulo de controle financeiro
