# GUI Rich Concept 3 Implementation Prompt

## Selected Image

- Source concept: generated GUI image 3
- Local reference: `C:\Users\notab\.codex\generated_images\019deb3d-c78d-7033-84ae-76b76e7d9852\ig_0ea22e85406ea5670169f6a674193c8191a0e28fc81aa0a4bd.png`
- Direction: premium data-rich planning console for experienced teachers.

## Canvas

- Primary desktop target: 1600 x 900.
- The application fills the viewport with a command ribbon, three-column working area, and bottom status bar.
- Tablet/mobile must stack panels without overlap, with the seating board remaining horizontally scrollable.

## Structure

1. Top command ribbon
   - Left: app icon, `席替え 5.5`, class label, capacity chip.
   - Center/right: reset, generate, manual swap hint, save/load, print.
   - Buttons are compact, icon-led, 8px radius, with the primary generate action in strong blue.
2. Left pane
   - Constraint matrix as a compact table.
   - Roster panel below, with segmented control for list/group/absence metaphor; current app keeps roster mode and roster rows.
   - Bottom actions for CSV and batch/name management when applicable.
3. Center pane
   - Tab-like header: current seating vs previous seating.
   - Main seating grid with blackboard label, row/column labels, and heat-map style tile treatment.
   - Selected two seats show dashed outlines and a swap arrow.
   - Bottom manual swap strip with selected seat card, target seat card, and swap/clear controls.
4. Right pane
   - Comparison summary table with previous/current/delta values.
   - Warning panel for repeated neighbors or manual adjustment status.
   - Score improvement factors.
   - History list.
5. Bottom status bar
   - Last saved, auto save, trial count, generated time, quick print/save actions.

## Visual Tokens

- Background: `#f4f7fb`
- Surface: `#ffffff`
- Surface muted: `#f8fbfd`
- Strong blue: `#005bac`
- Blue hover/tint: `#e8f2ff`
- Ink: `#162033`
- Muted: `#5b667a`
- Border: `#d7e1ea`
- Success: `#137333`
- Warning: `#a16207`
- Danger: `#b3261e`
- Boy tile: blue-tinted surface
- Girl tile: rose-tinted surface
- Unknown/neutral tile: white surface
- Manual selection outline: dashed blue and dashed green.

## Typography

- Japanese-ready sans stack already in `src/index.css`.
- Dense console scale:
  - App title: 1.25rem / 760
  - Panel title: 0.95rem / 760
  - Table and tile labels: 0.75-0.875rem
  - Seat names/numbers: 0.95rem / 800
- Letter spacing stays zero.

## Components

- `app-shell`: console shell.
- `topbar`: command ribbon.
- `workspace`: three columns, left 320px, center flexible, right 380px.
- `panel`: compact bordered surface.
- `seat-grid`: board-first work area with blackboard, legend, column labels, and stable tile dimensions.
- `seat-tile`: heat-map capable tile with gender and care chips.
- `swap-editor`: bottom strip that mirrors selected and target cards.
- `comparison table`: uses current diagnostics to show score and repeat deltas.

## Behavior

- Preserve existing business behavior:
  - attendance-number/name roster modes
  - generation
  - fixed/unavailable seats
  - manual swap after generation
  - CSV/JSON/print
  - localStorage persistence
- Manual swap must not allow fixed or unavailable seats.
- Empty target seats are valid targets.
- After manual swap, recalculate diagnostics and update the current history entry.

## Do Not

- Do not turn the page into a marketing hero.
- Do not hide the seating board below the fold on desktop.
- Do not introduce decorative gradient blobs or purple-dominant theme.
- Do not make controls nonfunctional just to match the image.
- Do not let Japanese labels overflow buttons or tiles.

## Acceptance Checklist

- Desktop screenshot resembles the selected concept: command ribbon, three working columns, center seating board, right analytics.
- Mobile screenshot stacks panels and keeps the board usable with horizontal scrolling.
- `npm.cmd run verify` passes.
- `npm.cmd run smoke:ui` passes and exercises generation plus manual swap.
