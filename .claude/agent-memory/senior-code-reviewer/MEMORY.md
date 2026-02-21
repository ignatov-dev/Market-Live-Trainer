# Senior Code Reviewer Memory — Market-Live-Trainer

## Project Overview
- React (JSX, no TypeScript) + Vite frontend, canvas-based candlestick chart
- Backend: Node/TypeScript (src/backend/), PostgreSQL via Neon
- State: all local React useState/useRef — no Redux, no Context API
- Styling: CSS Modules for components + global styles.css (light theme, NOT dark)
- Data flow: App.jsx owns all state, passes handlers + data as props down

## Architecture Decisions
- App.jsx (~2151 lines) is the single state owner; components are pure presentational
- Canvas drawing via imperative `drawCandles` / `drawEquityCurve` utilities — refs passed down
- Backend sync happens via polling effects in App.jsx; WebSocket for live ticks
- Pattern: all major calculations in utils/trading.js (pure functions)
- `chartDrawStateRef` pattern: mutable ref holds latest draw state to avoid stale closures in RAF loops

## CSS Conventions
- CSS Modules: `import styles from './Component.module.css'` — used consistently
- Global class names (`panel`, `panel-head`, `bracket-field-input`) used alongside CSS modules
- BracketField uses ONLY global class names (no module), intentionally shared styles
- ChartSkeleton uses CSS custom properties (--wick-top, etc.) via inline style for animation
- ChartMarkerTooltip uses inline `style={{ left, top }}` for absolute positioning (correct/intentional)

## Known Issues Found (2026-02-20 review)
- OpenPositionCard: `position.side` is 'long'/'short' in state but badge uses `styles.long`/`styles.short` —
  the condition checks `position.side === 'buy'` (WRONG). Should be `=== 'long'`.
- NewsTicker: passes framer-motion `style` prop directly to a plain `<div>` — MotionValue won't animate
  (should be `<motion.div>`). HeroHeader passes `{ opacity: heroFadeOpacity }` where heroFadeOpacity is
  a MotionValue, not a plain number.
- PositionBracketModal: imports `getPairCompactLabel` from formatters but formatters.js exports it —
  this is correct. No missing export.
- SessionSummary: `authSessionEmail` prop accepted but never rendered — prop accepted silently.
- PendingOrdersList: always renders the section (including the heading) even when orders.length === 0.
  Minor UX issue, not a crash.
- `drawCandles` hardcodes font 'Avenir Next' and background color '#f9fbff' — not using CSS design tokens.

## Import Patterns
- Constants from src/constants/{market,trading,chart}.js
- Utils from src/utils/{trading,candles,formatters,drawCandles,drawEquityCurve,patterns,coaching}.js
- No barrel index files; all imports are direct paths

## Files Flagged as Error-Prone
- src/components/OpenPositionCard/OpenPositionCard.jsx — side badge logic bug
- src/components/NewsTicker/NewsTicker.jsx — MotionValue passed to plain div
- src/components/HeroHeader/HeroHeader.jsx — same MotionValue issue via NewsTicker
