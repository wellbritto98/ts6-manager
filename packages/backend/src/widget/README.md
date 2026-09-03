# widget — Renderização de widgets públicos de servidor

## Objetivo do módulo

Gerar banners de status incorporáveis do servidor TeamSpeak (árvore de canais + clientes) em SVG/PNG/JSON, com temas, para consumo público por token — sem autenticação.

## Responsabilidade principal

Transformar dados do WebQuery (`channellist`/`clientlist`) em uma árvore tipada e renderizá-la como SVG com a paleta do tema escolhido. Lógica pura e testável; o acesso HTTP fica em `routes/widget-public.routes.ts`.

## Funcionalidades existentes

- `build-widget-tree.ts` — `buildWidgetTree(channels, clients, maxDepth, showClients, hideEmptyChannels)`: agrupa clientes humanos (`client_type 0`, flags away/muted) por cid, parse de spacers (`spacerType`: line/dashline/dotline/center/right/left), montagem por `pid`, poda por profundidade e canais vazios (spacers preservados).
- `widget-svg.ts` — `renderWidgetSvg(data)`: SVG de 400 px com header (nome, badge ONLINE, usuários/uptime), árvore recursiva com linhas de spacer, cadeados, badges de contagem, clientes com sufixos away/muted e rodapé; cores de `WIDGET_THEMES` (`@ts6/common`); texto com XML-escape e truncamento.

## Dependências

- **Internas**: `@ts6/common` (tipos `WidgetChannelNode`/`WidgetClient`/`WidgetData` + `WIDGET_THEMES`).
- **Externas**: nenhuma (o PNG é gerado na rota com `@resvg/resvg-js`).
- **Consumidores**: `routes/widget-public.routes.ts` (único); frontend consome o JSON/SVG via `WidgetPage`/`WidgetRenderer`.

## Módulos relacionados

`routes/widget-public.routes.ts` + `routes/widget.routes.ts` (CRUD/token/cache), `packages/frontend/src/components/widget/*` (preview e embed), `@ts6/common/src/widget-themes.ts` (paletas).

## Pontos de entrada

`build-widget-tree.ts` (`buildWidgetTree`), `widget-svg.ts` (`renderWidgetSvg`).

## Fluxos importantes

`GET /api/widget/:token/{data|svg|png}` → WebQuery → `buildWidgetTree` → `renderWidgetSvg` → resposta (cache 45 s em memória, CORS *). Frontend: `WidgetPage` busca `/data` a cada 30 s e renderiza com `WidgetRenderer` (estilos inline, embeddable).

## Arquivos críticos

`widget-svg.ts` (saída pública — escapar/truncar todo texto), `build-widget-tree.ts`.

## Observações técnicas e débitos

- **Código morto**: condição duplicada (`text === '___'` duas vezes, `build-widget-tree.ts:14`) e branch `'---'` inalcançável (já casada antes).
- **Cache compartilhado entre tokens** com evicção por ordem de inserção — um widget movimentado pode evictar outros (superfície de DoS cruzado; **Hipótese** sobre severidade).
- Duplicação de formatador de uptime com `discord/embeds.ts`.
- Sem testes no módulo (a lógica é pura e testável — candidata fácil a cobertura).
