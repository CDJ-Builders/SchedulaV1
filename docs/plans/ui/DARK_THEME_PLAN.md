# Schedula dark theme implementation plan

**Status:** Binary Light/Dark implementation underway; remaining review items are tracked in [`tools/PROGRESS.md`](../../../tools/PROGRESS.md)
**Date:** 2026-11-28  
**Scope:** Public landing page and signed-in student frontend, including authentication, profile/setup, Builder, Plotter, Teams, shared chrome, dialogs, and footer. Admin is excluded.  
**Depends on:** [Frontend review and mobile UI/UX plan](FRONTEND_REVIEW_AND_MOBILE_PLAN.md)

## Goal

Add a complete, accessible dark theme with a muted charcoal/graphite base and restrained gray-lavender accents, while preserving Bricolage Grotesque and the raised-key interaction. Users can switch between **Light** and **Dark**. The selected theme persists across pages and reloads, and the correct theme appears before the page is painted.

The theme will be built on shared semantic custom properties. Page CSS will consume those properties instead of defining parallel light-only palettes. This is a public frontend project; do not include or alter `frontend/admin`.

## Current state and constraints

- `frontend/scripts/theme.js` reads `schedula-theme` but always applies light. Its current toggle warns that dark mode is under maintenance and returns.
- `frontend/css/theme.css`, `main.css`, `background.css`, and `landing.css` each contain color tokens or base surfaces. `theme.css` is used by most app pages; login and signup also load `main.css`; landing uses its own root values.
- Public page component styles contain many literal plum, purple, lavender, white, and translucent colors. A theme selector added before these values are mapped would leave mixed light and dark controls.
- App pages already have `.theme-toggle` controls designed for a binary Light/Dark toggle. Keep this simple interaction model and make its saved value effective.
- `background.js` reads `data-theme` to choose particle color; particle colors are currently embedded in the script. The landing page has its own particle implementation, so renderer consolidation is a dependency for theme-aware particles.
- Auth pages and application pages do not share the same base stylesheet. Shared token loading and precedence must be reviewed before changing values.

## Theme behavior and preference model

### Resolution rules

1. Read the saved preference from `localStorage` key `schedula-theme`; valid values are `light` and `dark`.
2. If the key is absent or invalid, use `light` to preserve current behavior.
3. Apply the selected theme as `data-theme="light"` or `data-theme="dark"` on the root element before first paint. Do not consult the operating system preference.
4. Persist each explicit toggle so it applies across routes and reloads.
5. If storage is unavailable, theme selection should still work for the current page session; persistence failure must not prevent rendering.

### Control and interaction

- Keep the existing one-action toggle pattern, updating its accessible name to announce the available action (for example, “Switch to dark theme” in Light mode).
- Announce a change politely; avoid a disruptive alert.
- Landing uses the same binary preference and storage key. Do not give the public landing page a separate theme key or different toggle behavior.
- Keyboard behavior must include visible focus and a usable target. If the toggle opens a popup rather than switching directly, support Escape to dismiss it and return focus to its trigger. Touch targets follow the mobile plan.
- A resolved appearance change may use a short transition for background, foreground, border, and fill. Do not animate layout, dimensions, position, or broad box-shadow changes. Suppress nonessential transitions under reduced motion.

## Semantic token proposal

Token names are a contract proposal; inventory actual use before finalizing and avoid retaining ambiguous aliases indefinitely.

| Semantic role | Light direction | Dark direction |
|---|---|---|
| `--page` | Existing warm/off-white page base | Neutral charcoal, near `#151719` |
| `--surface` | White or very light lavender surface | Graphite surface, near `#1e2023` |
| `--surface-raised` | Elevated white/lavender | Slightly lighter graphite, near `#282b2f` |
| `--surface-inset` | Pale lavender/neutral input well | Deep neutral input well, near `#191b1e` |
| `--ink` | Existing deep plum, near `#2a1245` | Soft neutral white, near `#eceef0` |
| `--muted` | Existing secondary text with AA contrast | Muted neutral gray, near `#a9adb3` |
| `--accent` | Existing purple, near `#62298a` | Desaturated gray-lavender accent, near `#b6acbf` |
| `--accent-strong` | Deep purple action/edge | Soft gray-lavender for restrained emphasis |
| `--lavender` | Existing lavender, near `#b596c8` | Use sparingly; current states should be muted and legible |
| `--line` | Plum-tinted low contrast border | Neutral graphite border with enough contrast to define controls |
| `--key-face` / `--key-edge` | Existing raised key appearance | Preserve raised depth with graphite faces and neutral edges |
| `--shadow` / `--shadow-raised` | Plum-tinted shadows | Neutral black shadow; avoid relying on shadow alone to separate surfaces |
| `--focus-ring` | High-contrast purple/lavender outline | Muted high-contrast neutral/lavender ring, visible over every surface |
| `--danger`, `--warning`, `--success` | Existing semantic feedback tuned for light | Re-tuned colors with readable text, icon, and border pairings |
| `--particle` | Light-theme decorative particle color | Dark-theme decorative particle color |
| `--overlay` | Translucent plum overlay | Translucent neutral near-black overlay |

The starting hex values are palette direction, not approved final values. Check every foreground/background pair, including button labels, disabled text, validation messages, selected schedule blocks, and diagram/grid content. Do not blindly map every white literal to `--surface`: some are highlights, translucent overlays, chart blocks, or key bevels with distinct roles.

## Public page and component coverage

Every route must be reviewed in both modes, including interactive states. Map each page stylesheet to semantic variables and retain layout declarations as page-specific rules.

| Surface | Styles/scripts to include | Dark-specific checks |
|---|---|---|
| Landing | `index.html`, `landing.css`, `chrome.css`, `popup.css`, theme and particle scripts | Header glass, hero copy, demo grid, schedule block colors, CTA keys, theme menu, footer and particles |
| Login/signup | `login.html`, `signup.html`, `main.css`, `auth.css` | Auth header, card, fields, password control, inline errors, disabled submit, autofill/native controls |
| Forgot password/setup | `forgot-password.html`, `setup.html`, `auth.css`, `profile.css` | Mixed stylesheet precedence, progress controls, validation, completion state |
| Home | `home.html`, `dashboard.css`, `chrome.css`, `background.css` | Dashboard surfaces, schedule blocks, day controls, active state, empty/loading/error states |
| Builder | `builder.html`, `builder.css`, `custom-dropdown.css`, `popup.css` | Form fields, custom dropdowns, block states, conflict feedback, import UI, dialogs/sheets |
| Plotter | `plotter.html`, `plotter.css`, `custom-dropdown.css` | Grid, color choices, selected blocks, hidden details, export preview, tab/control state |
| Profile | `profile.html`, `profile.css` | Preference grids, selected days, checkboxes, carousel controls, account actions |
| Teams | `teams.html`, `teams.css`, `team-preferences.css`, `popup.css` | Multi-member palette, availability/free-time legend, proposals, status, dialogs and destructive actions |
| Team settings | `teams-settings.html`, `teams-settings.css`, `team-preferences.css` | Inputs, member list, selection, destructive and success states |
| Shared chrome | `chrome.css`, `footer.js`, `popup.css`, shared header/footer markup | Header/footer surfaces, active navigation, focus, dropdown, toast/dialog stacking and mobile navigation |

Admin styles and markup are explicitly outside this work. Avoid adding global theme selectors that accidentally change admin pages if it is later served in the same origin; scope tokens to the public frontend or confirm how admin loads styles before introducing selectors.

## Implementation phases

### Phase 0 — Inventory and visual baseline

1. Enumerate every in-scope page, stylesheet order, script order, and theme control.
2. Capture representative baseline screens in Light at 390px and 1280px, including landing, auth, Home, Builder form/dialog, Plotter options, Teams dialog, and Profile preferences.
3. Inventory literal colors by role, not just by hex. Use repository searches plus computed styles for repeated overrides and inline SVG attributes.
4. Record focus, hover, active, disabled, invalid, success, selected, empty, loading, and overlay states for each page.
5. Confirm the final user-facing preference control placement and ensure existing mode choice is backward-compatible: legacy stored `light` or `dark` values remain valid.

**Exit:** token inventory and page-state checklist are reviewable; no product code has been changed as part of this planning step.

### Phase 1 — Shared token foundation, Light preserved

1. Define semantic Light tokens in the shared theme layer and apply them to the public root. Retain current computed Light appearance as closely as possible.
2. Resolve stylesheet ownership: auth must load the shared token foundation without duplicate `:root` declarations silently overriding it; landing variables should map to the same semantic roles.
3. Migrate shared chrome, raised keys, common surfaces, controls, popups/dialogs, and footer first.
4. Use `currentColor` for SVG icons when they represent foreground. Give status icons explicit semantic tokens where color meaning differs.
5. Remove universal color/border/shadow transitions or `transition: all` while changing ownership; define a small property list for theme changes.

**Exit:** Light mode has no unintended visual regressions across all public pages; shared controls have one token source; no unresolved stylesheet-order dependency remains.

### Phase 2 — Dark palette and component states

1. Add `[data-theme="dark"]` semantic values and set `color-scheme: dark` only when resolved dark is active; keep native form controls legible.
2. Tune base page, surfaces, text, borders, and focus ring around neutral charcoal/graphite; use muted gray-lavender only for restrained state accents.
3. Migrate keys, fields, cards, dialogs, dropdowns, toasts, tables/lists, schedule canvases, and page-specific panels.
4. Tune schedule and team visualization colors as a set. Use borders/labels/pattern or shape cues so adjacent events and free/busy states remain distinct without color alone.
5. Review imagery, logos, favicon, grid lines, decorative accents, and particle colors on both backgrounds.
6. Cover error, warning, success, selected, disabled, hover, active, focus, empty, and loading states in each component family.

**Exit:** every in-scope route renders consistently in Dark; no white control or dark text is stranded on the wrong surface; states remain distinguishable and readable.

### Phase 3 — Preference resolver and no-flash initialization

1. Implement a small shared theme resolver that validates `light | dark`, defaults to Light, applies the root attribute before first paint, and handles unavailable storage safely.
2. Ensure this resolver runs before styles paint on landing and every public page. Prefer one shared implementation or identical minimal inline bootstrap generated from a single source; avoid a delayed DOM-ready-only theme set.
3. Preserve legacy `schedula-theme=light|dark`; treat absent/invalid values as Light. Store the selected theme directly.
4. Do not add an OS preference listener. A user toggle is the only way to change the selected theme.
5. Make the visible control reflect selection and resolved appearance without using hardcoded SVG stroke colors.

**Exit:** no theme flash on cold load/reload; all routes honor the same saved Light/Dark preference; OS preference changes do not override the user's selection.

### Phase 4 — Mobile and accessibility integration

1. Integrate the binary toggle with the mobile navigation/account layout in the frontend review plan. Keep it reachable and ensure it does not conflict with fixed navigation or safe-area insets.
2. Verify keyboard focus, selection state, Escape/dismissal, focus return, screen-reader announcement, and touch target size.
3. Confirm color contrast for normal text, large text, icons, borders needed to identify controls, focus indicators, and disabled/validation states.
4. Check 320px reflow, 200% zoom, short-height landscape, virtual keyboard, and reduced motion.
5. Verify theme switching while dialogs, dropdowns, schedule blocks, and team comparison states are visible.

**Exit:** theme control remains operable without obscuring content; contrast and focus criteria pass on mobile and desktop.

### Phase 5 — Particle and transition integration

1. Complete the separately planned particle-loop consolidation before wiring theme changes to canvas color.
2. Cache the semantic particle color and update only when resolved theme changes; do not query computed style or allocate particle state every frame.
3. Respect `prefers-reduced-motion`, hidden documents, resize, and mobile performance limits. Avoid a second landing loop.
4. Apply short color transitions only to appropriate surfaces; no global animation of the entire DOM tree.

**Exit:** one decorative renderer at most, correct colors in both modes, paused when hidden/reduced-motion, and no layout shift during theme changes.

### Phase 6 — Final review and cleanup

1. Search for remaining public page literal colors and classify each as semantic, illustration/data color, or intentional highlight. Resolve or document every exception.
2. Search for all theme toggles, localStorage reads/writes, hard-coded theme SVG attributes, and legacy `data-theme` assumptions.
3. Verify stylesheet and script paths on all routes; check direct page loads, reloads, and navigation between routes.
4. Capture the final route/state matrix at 390px and 1280px in Light and Dark. Add short-height/landscape and keyboard/reduced-motion spot checks.
5. Keep admin unchanged and verify no accidental style leakage into it.

**Exit:** coverage matrix is complete; known exceptions are documented; product owner can review Light/Dark pairs before release.

## Validation matrix

| Dimension | Required cases |
|---|---|
| Preference | Missing key defaults to Light, saved Light, saved Dark, invalid stored value defaults to Light, storage unavailable, repeated toggling across routes/reloads, OS light↔dark changes do not alter the selected theme |
| Load/navigation | Direct URL, reload, landing to login/signup, auth to setup/home, signed-in route changes, return from Profile |
| Viewports | 320, 360, 390, 768, 1024, 1280 CSS px; short phone height and landscape; 200% zoom |
| Interaction states | Default, hover-capable pointer, touch press, focus-visible, selected/current, disabled, invalid, success, empty/loading, open overlay |
| Components | Header/mobile nav, keys, fields/native controls, custom dropdown, schedule blocks, plotter palette, team legend, dialogs/sheets, toasts, footer |
| Accessibility | Contrast, keyboard operation, focus order/return, accessible selected state, status announcement, non-color cues, reduced motion |

## Release acceptance criteria

- Light and Dark choices persist and apply correctly on every in-scope page.
- The resolved theme is applied before first paint; no light flash on a saved Dark preference and no dark flash on saved Light.
- Light retains the existing brand appearance; Dark uses neutral charcoal/graphite surfaces and restrained gray-lavender accents.
- Text and relevant control/state boundaries meet WCAG AA contrast targets. Schedule/team meaning never depends on color alone.
- Keys preserve their recognizable face/edge/press treatment in both modes, with visible focus and usable disabled states.
- Auth, Builder, Plotter, Teams, Profile/setup, landing, dialogs, and shared chrome have no mixed-theme surfaces.
- Native inputs, dropdowns, status messages, logos, SVG icons, grids, and export previews are legible in both modes.
- Reduced motion prevents decorative canvas animation and nonessential movement consistently.
- Theme choice can be changed by keyboard and touch at phone and desktop widths without browser alerts.
- No admin page behavior or styling is changed by public theme selectors.

## Risks and decisions to record

- **Token migration risk:** page CSS has overlapping literal values and specificity. Mitigate by migrating one component/page group at a time and comparing Light before Dark rollout.
- **Palette contrast risk:** proposed lavender may work as a highlight but fail as small text on a raised surface. Choose foreground/background pairs based on measured contrast, not palette consistency alone.
- **Bootstrap duplication risk:** a late external script can flash; duplicate inline snippets can drift. Select one reliable pre-paint integration that works with current static pages and keep resolution logic single-sourced.
- **Native control variance:** `color-scheme` changes browser rendering; inspect date/time/select controls on supported browsers.
- **Canvas lifecycle risk:** theme changes should update particle color without starting duplicate loops or rebuilding unrelated background decoration.
- **Theme switch during overlays:** confirm existing dialogs, menus, and toasts repaint cleanly without restarting entrance animations or losing focus.
- **Mobile navigation placement:** final location for the binary toggle should align with the mobile review's account/navigation design; do not add another cramped header button.

