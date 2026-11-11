# Design: Casa em Dia

The standard look of a finance app, played straight and held to the finish of Nubank and Copilot Money. It follows the operating system's light or dark mode.

## Structure
- Desktop (≥1024px): a fixed 248px sidebar with brand, five sections and settings, plus a sticky top bar with the month switcher and the primary "Lançar" button.
- Mobile: a bottom tab bar with five sections; settings sit in the top bar.
- Content uses a 12-column grid. Summary comes first: leftover money and the settlement, then bills and cards, then housing, goals and market data.
- Every shared or private block carries a visibility badge: "Os dois veem" or "Só você vê".

## Tokens
- Ground `#f3f6f6` / `#0c1214`; surface `#fff` / `#121a1c`; hairline borders.
- One accent, petrol teal `#1e5f67` (dark mode `#7cc4c9`), for actions, selection and paid state.
- Person colors teal `#0a9a96` and amber `#b97515` (dark mode `#25a39b` and `#c0851f`), checked with the dataviz validator in both themes. They are used only for chips, avatars and the split bar.
- Semantic colors: red for overdue, orange for due today.
- Type: Geist only, with tabular figures for every money value.
- Radii: 16px cards, 10px controls, 999px badges.

## Imagery
- Soft matte clay 3D icons in teal, mint and amber (`public/img/*.webp`). They appear one per card header at 44px and in empty states at 72px. They were generated with fal (`google/nano-banana-2.1`) as a single 3×3 sheet, with the background removed by `fal-ai/birefnet/v2`, then cut into separate files.
- UI glyphs are authored line icons (`src/icons.js`).
- The app icon is a vector house with a coin (`public/icons/icon.svg`).

## Charts
- Single-series lines with an area fill, a faint grid and an emphasized endpoint, plus a crosshair tooltip and a table view.
- Horizontal bars use a single hue and direct labels.
- The split bar has a 50% marker.
- No dual axes.
