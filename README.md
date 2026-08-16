# GrowinStones — Configurador hidropônico

App em React + Vite + Tailwind para projetar estufas hidropônicas: estrutura,
disposição de vasos, tipos de ligação hidráulica, equipamentos, custos,
produção e relatório em PDF (9:16).

## Requisitos
- Node.js 18 ou superior (https://nodejs.org)

## Como rodar
```bash
npm install
npm run dev
```
Abra o endereço mostrado no terminal (normalmente http://localhost:5173).

## Build de produção
```bash
npm run build
npm run preview   # testa o build localmente
```
Os arquivos finais ficam em `dist/` — pode hospedar em qualquer serviço
estático (Vercel, Netlify, GitHub Pages…).

## Estrutura
- `src/growinstones.jsx` — todo o app (componente único)
- `src/main.jsx` — bootstrap do React
- `src/index.css` — importa o Tailwind (v4, sem arquivo de config)

## Observação sobre o PDF
Rodando localmente, o botão "🖨 Imprimir nesta aba" também funciona
(fora do sandbox o `window.print()` é liberado). O botão de download
continua gerando o arquivo 9:16 pronto para "Salvar como PDF".
