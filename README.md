# Odyssey

Custom capital flow rendering engine + product UI.

## What this repo contains

- React + Vite application shell
- Custom flow rendering engine (not a standard Sankey)
- Deterministic layout + routing system
- Bundle lane reservation
- Thickness conservation + junction shaping

## Current capabilities

- Multi-strand capital flows
- Scenario overlay (actual / robust / delta)
- Confidence / uncertainty bands
- Residual / leakage channels
- Product-style UI wrapper

## Architecture

/src
  /odyssey
    /engine       -> layout, routing, flow math
    /components   -> renderer + UI primitives
    /data         -> demo dataset

## Status

- Engine is functional and deterministic
- Visual system is approaching "river physics"
- Next step: move to Canvas / Pixi for strand-field rendering

## Run locally

npm install
npm run dev

## Next steps

- Canvas/WebGL renderer
- Path-level interaction
- Real portfolio data integration
- Scenario engine integration
