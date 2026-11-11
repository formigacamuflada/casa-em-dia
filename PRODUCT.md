# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated (not asked, fixed by the platform): a claude.ai Artifact, one self-contained HTML page with vanilla JS and no build step. It uses the Artifact runtime capabilities `db` (a shared document store with a private subtree per person) and `user` (who is viewing). Fonts load only from Google Fonts and scripts only from the allowlisted CDNs. A claude.ai Artifact is the only option here that gives two people one shared page with privacy enforced per person.

## Users

A couple moving in together in Belo Horizonte: João (the artifact owner) and his partner. Each opens the panel from their own Claude account, on the phone and on the computer about equally. Their job is to keep the household's month under control. They need to see what is due and when, who pays what, who owes whom at the end of the month, how much each of them has left, their cards, the cost of living in the home, their investments and the shared goals.

## Product Purpose

One panel for the couple's money. Household bills ("contas da casa") are shared and split 50/50. Each person pays whichever bills they want, and the panel works out the monthly settlement ("acerto"): who sends a Pix to whom. Each person also keeps their own personal bills and investments in the same page, visible only to them. Success means that every month both of them know what is due, what is already paid, how much is left, and what the acerto is, without either person seeing the other's private entries.

## Positioning

Shared and private live in the same page, and the platform enforces the private part per person instead of relying on trust or on separate apps. Bank data arrives read-only through Open Finance (Meu Pluggy), and Claude imports it into the owner's private area. Macro context comes straight from the Banco Central.

## Operating Context

- Monthly cycle in BRL with pt-BR formatting. Bills have a due day ("vencimento"), credit cards have a closing day, a due day and monthly statements ("faturas"), and settlements happen by Pix.
- The user showed a reference image of another couples-finance dashboard as a functional reference (balance forecast, split, cards, bills due, housing cost). Its visual design must not be reproduced, and the user accepted an original design.
- Data sources: manual entry by each person; João's accounts, cards and investments from Open Finance via Meu Pluggy plus a local, read-only MCP extension in Claude Desktop on Windows, which Claude imports into his private area; public macro data from the Banco Central (SGS series, the Focus survey, PTAX).

## Capabilities and Constraints

- Visibility (binding, from the user): household bills are the same for both of them; a personal bill is visible only to the person who entered it.
- Income: both incomes are visible to both of them (confirmed).
- Investments: each person's portfolio is private; couple goals (for example the apartment down payment) are visible to both (confirmed).
- Split: 50/50 with a monthly acerto (confirmed).
- Cards: only the couple's real cards, added by them or imported. Never invent cards.
- Read-only finance: nothing in the product moves money.
- Privacy follows platform access rules and is not encryption. The artifact owner controls the page code.
- Open: the partner's own bank integration (she would need her own Meu Pluggy).

## Brand Commitments

- The user asked for a clean design that follows sound UI/UX rules.
- Standing preference (direction round, 2026-11-10): the category standard for finance apps, played straight. That means a fixed side navigation, clear summary cards and one accent color. The finish should match Nubank and Copilot Money (the user's choice), without copying the visual design of either one or of the reference image.
- 3D illustrated icons, original and generated with fal.

## Evidence on Hand

- No real bills, cards, incomes or balances have been provided yet. Never fabricate the couple's figures. Empty states must teach how to add the first entry.
- Real macro data from the Banco Central, fetched on 2026-11-10.

## Product Principles

1. Privacy is legible: every block says who can see it.
2. The month is the unit. Due dates, paid status and the acerto all belong to a month.
3. Answer "quanto sobra" and "quem acerta com quem" at a glance.
4. Only real numbers. When something is missing, show how to add it rather than a placeholder figure.
5. Read-only and calm: the panel informs decisions and never acts on money.
