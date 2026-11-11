# Design: Casa em Dia

One design, two palettes. The structure comes from the Duo Finn concept (sidebar, balance with a colored bar, split bar with person dots, bills by due day, housing with icons, real-looking cards). The finish comes from Robinhood: black, white and neutrals with purposeful green, big numbers, and clean charts with a gradient and a glowing endpoint. Light and dark share every layout and component; only the tokens change.

## Structure
- Desktop (≥1024px): a floating sidebar card (264px) with the couple's avatars, "Menu" and "Ajustes" groups, a light/dark toggle and the user card; a floating top bar with the month ("Novembro 2026", year in gray) and the green "Lançar" button.
- Overview: a 3-column board. Row 1: Saldo previsto (2 columns) and Contas a pagar. Row 2: Divisão da casa, Cartões, Moradia. Row 3: Metas and Mercado (2 columns). Two columns below 1280px, one column on phones.
- Mobile: bottom tab bar with five sections; theme and settings sit in the top bar.
- Every shared or private block carries a visibility badge: "Os dois veem" or "Só você vê".

## Tokens (theme.css)
- Light: ground `#f3f2ef` (warm gray), white cards, hairline borders `#e7e6e1`, text `#0a0b0d`.
- Dark: ground `#121212`, black cards, borders `#222224`, text `#f6f6f4`.
- Action green `#00C805` with black text in both themes; green text `#007a12` (light) / `#2fe03c` (dark). Robin Neon `#CCFF00` only for highlights in dark mode (chart endpoint, sobra segment).
- Up `#00C805` family, down `#FF5000` family.
- People: blue (person 1) and pink (person 2) for dots, avatars and the split bar.
- Balance bar: navy (half of the house), blue (personal bills), gray (day-to-day), green (leftover).
- Type: Geist; money as gray "R$", bold integer, small cents. Hero values 68–76px, card values 40px.
- Radii: 22px cards, pill buttons and controls.
- The theme follows the OS until the person picks light or dark in the sidebar (saved in localStorage).

## Components
- Balance: hero value, "x% do salário livre", 4-color segmented bar and legend with amounts and percentages.
- Bills to pay: unpaid total, day pills with dots (one per bill), round check rows; the list scrolls inside the card.
- House split: "Você paga / Ana paga", blue/pink bar with percentages and a 50% marker, "Quem paga cada conta" with person dots, Pix footer with "Marcar feito".
- Cards: realistic face (bank color gradient, sheen, EMV chip, contactless, nickname spaced in caps, due date, available limit), horizontal carousel, next three bills. The new-card form shows a live preview and picks the color from the bank name.
- Housing: "Só meu salário / Salário do casal" toggle, green bar from 0 to 60% with a 30% marker (amber/orange past it), icon tiles per bill type.
- Bill type icons (line, in a soft green tile): key (rent), building (condo), bolt (power), wifi, drop (water), flame (gas), document (taxes), cart, car, heart, book, play, piggy bank.

## Charts
- Robinhood style: no grid, no y-axis; line with a horizontal gradient, area fading down, radial glow and blurred dot at the latest point, vertical marker and a label pill ("nov/26"), dotted baseline at the start of the period.
- Big value above the chart follows the finger/cursor (date and change update while scrubbing).
- Period pills 6M / 1A / 2A.
- History bars are translucent green "glass" bars; the current month glows.

## Imagery
- 3D icons in `public/img`, one per card header, mapped in one place (`ILL` in `src/main.js`). Being replaced by a glassy lime-green set generated with fal (`google/nano-banana-2.1`, background removed with `fal-ai/birefnet/v2`).
- UI glyphs are authored line icons (`src/icons.js`).
