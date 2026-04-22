# Odyssey review and custom rendering engine kickoff

## What was in the export

- `PortfolioOSOdysseyV2Scaffold.tsx` — real shell scaffold with nav / top bar.
- `PortfolioOSOdysseyDataDriven.tsx` — minimal proof of data model wiring.
- `PortfolioOSOdysseyV7Cinematic.tsx` to `V10UnifiedRiverSystem.tsx` — placeholders only.
- `PortfolioOSOdysseyV12ArtDirectionLayer.tsx` — the only substantial visual implementation in the export.
- `main.tsx` — pointed directly at V12.

## What is missing

The export did **not** yet contain a true rendering engine. V12 is a strong static art-direction layer, but:

- paths are hard-coded
- no reusable geometry engine exists
- no separation between data, layout math, and renderer
- no scenario overlay model beyond static card text
- no lot/strand/confidence abstraction exists yet

## What this update adds

A real starter architecture for the custom renderer:

- `src/odyssey/types.ts`
- `src/odyssey/data/demoOdyssey.ts`
- `src/odyssey/engine/flowMath.ts`
- `src/odyssey/components/NodeCard.tsx`
- `src/odyssey/components/RiverRenderer.tsx`
- `src/odyssey/components/OdysseyCustomEngine.tsx`

## What the new engine does

- renders flows from node/link data instead of hard-coded decorative shapes
- uses a reusable Bezier area-path builder
- adds multi-strand flow lines over the ribbon body
- adds a scenario overlay path system
- adds confidence-band halos
- adds dashed residual/leakage channels
- keeps the renderer inside a product-UI shell instead of a bare artboard

## Best next implementation steps

1. Replace demo data with the app's real flow schema.
2. Add hover / select path isolation.
3. Add true stage layout from data rather than fixed coordinates.
4. Promote the renderer into its own route/module inside the larger product.
5. If density/performance becomes an issue, port the SVG renderer to Canvas/WebGL.
