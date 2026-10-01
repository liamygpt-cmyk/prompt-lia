# Prompt LIA

Teleprompter PWA, local-first, com câmera e microfone para gravação vertical no iPhone.

## O que faz

- Mostra o roteiro rolando sobre a prévia da câmera.
- Grava o vídeo limpo (o texto não aparece no arquivo final).
- Controles de velocidade, fonte, posição, fundo e espelhamento.
- Câmera frontal/traseira, contagem regressiva e cronômetro.
- Salva ou compartilha o vídeo pela folha de compartilhamento do iPhone.
- Guarda roteiro e ajustes no próprio aparelho.

## Rodar localmente

```bash
python3 -m http.server 4173
```

Abra `http://localhost:4173` no computador. Para câmera no iPhone, publique em HTTPS (GitHub Pages, Cloudflare Pages, Netlify ou similar).

## Limitação do iOS

O iOS não permite uma janela arbitrária sobre o app Câmera da Apple. Por isso, o Prompt LIA abre a câmera dentro do próprio app e grava ali. O vídeo final não inclui o texto do teleprompter.
