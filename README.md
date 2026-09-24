# KART

Corrida de kart **original** no navegador. Câmera de perseguição, asfalto com peso, drift que vale turbo e itens que mudam a prova — inspirada no gênero, sem qualquer personagem, item ou pista da Nintendo.

**Jogar agora:** [https://kt3746.github.io/grokbot-kart/?v=202609241630](https://kt3746.github.io/grokbot-kart/?v=202609241630)

## Como jogar

1. Abra o link acima (ou rode o jogo localmente).
2. Toque ou clique uma vez para liberar o áudio (obrigatório no Safari do iPhone).
3. Escolha **Corrida rápida** (uma pista, 3 voltas) ou **Campeonato curto** (três provas, tabela de pontos, tela de troféu).
4. Veja as estatísticas do kart antes de confirmar. Cada chassi dirige diferente.
5. Complete as voltas. Caixas douradas no asfalto enchem o slot de item.

O jogo detecta PC e celular sozinho. Controles na tela aparecem se a janela for estreita (menos de 820px), se o ponteiro for grosso, ou se o aparelho tiver toque. No desktop largo, teclado. No tablet, teclado e toque juntos.

## Controles

### Teclado (desktop)

| Ação | Teclas |
| --- | --- |
| Acelerar | ↑ ou W |
| Frear / ré | ↓ ou S |
| Dirigir | ← → ou A D |
| Drift | Shift ou Espaço |
| Usar item | E ou Ctrl |
| Pausa | Esc |

Segure o drift numa curva e solte **limpo** (sem bater no muro) para um turbo curto. O campo de visão e o motor respondem.

### Toque (iPhone / Android)

- **Esquerda:** direcional (arraste).
- **Direita:** Acelera, Freio, Drift, Item.

A página **não trava o scroll nos menus** (você consegue ver Voltar e Continuar). Durante a corrida o scroll fica bloqueado para o toque não empurrar a página. Não depende de pointer lock nem de WebGPU.

## Modos

- **Corrida rápida** — escolhe kart e pista, 3 voltas, quatro karts no grid (você + 3 adversários).
- **Campeonato curto** — Orla da Garoa → Serra do Vapor → Beco das Lanternas. Pontos 10 / 7 / 5 / 3. No fim, classificação e troféu.

## Karts

| Kart | Papel |
| --- | --- |
| Vespa Relâmpago | Ágil — entra tarde, sai cedo |
| Cometa Rubi | Equilibrado |
| Guardião Ferro | Pesado — reta e presença |
| Zíper Noturno | Especialista em drift |

## Pistas

| Pista | Clima | Atalho |
| --- | --- | --- |
| Orla da Garoa | Noite litorânea, farol | Faixa de areia na curva longa |
| Serra do Vapor | Neblina, túnel, hairpin | Corte interno de terra |
| Beco das Lanternas | Mercado noturno, neon | Corredor de serviço |

Sair do asfalto **segura** o kart. Atalho é mais curto, com menos aderência.

## Itens

- **Disco Ímã** — projétil que segue a fita da pista e procura quem está à frente.
- **Sabão industrial** — poça escorregadia que você deixa para trás.
- **Carga Turbo** — empurrão curto.
- **Cortina de fuligem** — nuvem que atrasa quem vem atrás.
- **Gancho de caixa** — aumenta o alcance para a próxima caixa.

## Rodar localmente

Precisa de Node 20+.

```bash
npm install
npm run dev
```

Abra `http://localhost:5173/grokbot-kart/` (o `base` do Vite é `/grokbot-kart/`, o mesmo do GitHub Pages).

```bash
npm run build
npm run preview
```

## Publicação

O workflow em `.github/workflows/deploy.yml` gera o site e publica no GitHub Pages a cada push em `main`. Depois do primeiro merge, ative Pages em **Settings → Pages → GitHub Actions**.

Depois de cada visual/deploy, abra com cache-bust `?v=YYYYMMDDHHMM` (horário de São Paulo), por exemplo `?v=202609241630`.

## Licença

MIT. Áudio é sintético (Web Audio). Nenhum sample protegido.
