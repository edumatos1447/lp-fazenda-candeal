# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Landing page de alta conversão para **Fazenda Hotel Candeal** (Conceição do Jacuípe, BA), construída com Astro 6 + React + Tailwind CSS v4. Integra-se a uma aplicação Next.js + Supabase via 3 endpoints REST para captação de leads, captura parcial ("carrinho abandonado") e redirecionamento para WhatsApp.

Requer Node >= 22.12.0.

## Commands

```sh
npm install         # instala dependências
npm run dev         # dev server em http://localhost:4321
npm run build       # build de produção → ./dist/
npm run preview     # preview do build local
npm run astro ...   # CLI do Astro (astro add, astro check, etc.)
```

Não há testes configurados.

## Environment Variables

Copie `.env.example` para `.env` e preencha:

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `PUBLIC_API_BASE_URL` | Sim | URL base da app admin Next.js (sem barra final) |
| `PUBLIC_WHATSAPP_NUMBER` | Sim | Número WA da fazenda com DDI (ex: `5571999990000`) |
| `PUBLIC_WHATSAPP_ESCOLAR_NUMBER` | Não | Número WA exclusivo do Day Use Escolar (default: `5571993043763`) |
| `PUBLIC_YOUTUBE_VSL_ID` | Não | ID do vídeo YouTube para a seção VSL |
| `PUBLIC_META_PIXEL_ID` | Não | ID do Meta Pixel (seção de tracking em `Layout.astro`) |
| `PUBLIC_GOOGLE_ADS_ID` | Não | Measurement ID GA4/Google Ads (ex: `G-XXXX`) |
| `PUBLIC_DAYUSE_PAYMENT_URL` | Não | URL do gateway de pagamento Day Use (vazio = botão oculto) |

## Tech Stack

- **Astro 6** — framework principal, file-based routing
- **React 19** via `@astrojs/react` — usado apenas no `LeadForm.tsx` (React island com `client:load`)
- **Tailwind CSS v4** via `@tailwindcss/vite` — CSS-first, sem `tailwind.config.js`; tokens de design em `src/styles/global.css` no bloco `@theme`
- **Inter** via Google Fonts — carregada em `Layout.astro`

## Architecture

```
src/
  pages/index.astro           # composição de todos os componentes (sem lógica)
  layouts/Layout.astro        # HTML shell: Inter font, Meta Pixel, gtag, script UTM
  styles/global.css           # @import tailwindcss + @theme com tokens de cor e fonte
  components/
    StickyHeader.astro        # header fixo: logo + botão WhatsApp
    HeroSection.astro         # hero full-bleed: headline + 2 CTAs
    SocialProofBar.astro      # barra verde: estrelas Booking, localização, diferenciais
    VideoSection.astro        # YouTube embed (exibido só se PUBLIC_YOUTUBE_VSL_ID definido)
    AmenitiesSection.astro    # grid de 6 diferenciais da fazenda
    GallerySection.astro      # grade de fotos (placeholders substituíveis)
    ReservationSection.astro  # wrapper Astro que monta o React island
    LeadForm.tsx              # ★ componente React principal (ver abaixo)
    DayUseSection.astro       # seção Day Use com CTA de pagamento
    SchoolDayUseSection.astro # seção Day Use Escolar — CTA vai para WA próprio (PUBLIC_WHATSAPP_ESCOLAR_NUMBER)
    TestimonialsSection.astro # depoimentos fixos de hóspedes
    FAQSection.astro          # perguntas frequentes com <details>
    FooterSection.astro       # footer com CTA strip + info + links
    FloatingWhatsApp.astro    # botão flutuante fixo (z-50)
```

## LeadForm.tsx — fluxo de dados

1. **Mount** → `GET ${PUBLIC_API_BASE_URL}/api/periodos/disponiveis` → popula seletor de períodos
2. **onBlur(telefone)** (após nome preenchido, uma vez) → `POST /api/leads-parciais` silencioso com UTMs de `window.__utms`
3. **Submit** → `POST /api/reservas` → 201: abre `wa.me` com mensagem pré-preenchida + dispara eventos de conversão (`fbq`, `gtag`) → 409: "vagas esgotadas" → 500: link direto WA

## Rastreamento de origem dos leads

`WhatsAppLeadModal.tsx` intercepta **todo** clique em `a[href*="wa.me"]` fora de `#reserva` (em capture phase, com `stopPropagation`). Consequência: um `onclick` no próprio `<a>` **nunca dispara** — o evento morre antes de chegar no elemento. Toda instrumentação de CTA passa por dois `data-*` lidos pelo modal:

| atributo | default | efeito |
|----------|---------|--------|
| `data-lead-tipo` | `whatsapp_direto` | vira a coluna **Origem** da planilha |
| `data-fb-event` | `Lead` | evento disparado no Meta Pixel |

Valores em uso: `day_use_escolar` (+ `data-fb-event="Contact"`, único CTA fora do funil de reserva), `day_use`, `whatsapp_flutuante`, `whatsapp_direto`. O `LeadForm` envia `formulario_hotelaria` / `formulario_day_use`.

Ao adicionar um CTA de WhatsApp, marque-o — sem `data-lead-tipo` ele cai no balde genérico. Novos valores precisam de rótulo em `ROTULOS_ORIGEM` no Apps Script.

## Planilha de leads (Google Apps Script)

Código versionado em `docs/apps-script-planilha.gs`. Monta cada linha a partir do cabeçalho **real** da planilha e acrescenta colunas ausentes à direita, então dá pra adicionar campos sem desalinhar o histórico. Basta incluir a coluna em `CAMPOS` + `ORDEM`.

Os POSTs usam `mode: 'no-cors'` — falhas são invisíveis no browser. Campo enviado que não tenha coluna correspondente é descartado em silêncio.

Ao republicar: **Gerenciar implantações > editar > Nova versão** (uma implantação nova gera outra URL e quebra `PUBLIC_GOOGLE_SHEETS_WEBHOOK_URL`).

## UTM Capture

Capturado em `Layout.astro` via `<script>` inline e exposto como `window.__utms` (tipado em `src/env.d.ts`). O `LeadForm.tsx` lê `window.__utms` ao disparar `/api/leads-parciais`.

## Design Tokens (Tailwind v4)

Definidos no bloco `@theme` em `src/styles/global.css`:

| Token | Valor | Uso |
|-------|-------|-----|
| `primary` | `#2d6a4f` | CTAs, ícones, bordas de foco |
| `primary-dark` | `#1b4332` | hover de CTAs, seções escuras |
| `accent` | `#b7791f` | urgência, tags, estrelas |
| `bg` | `#faf9f5` | fundo geral (off-white creme) |
| `bg-dark` | `#f0ede6` | seções alternadas |

## Adicionando fotos reais

1. Coloque as imagens em `/public/images/`
2. Substitua os placeholders em `GallerySection.astro` (campo `src`) e `HeroSection.astro` (comentário no bloco de imagem de fundo)
3. As imagens em `public/` são servidas como estáticas sem processamento
