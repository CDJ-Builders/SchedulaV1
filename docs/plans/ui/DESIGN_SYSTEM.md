# Schedula Design System Reference

Read-only inventory of the public and admin CSS present in this repository. Values and selectors below are taken from the cited files. The consolidation section is a proposal only; this document does not change stylesheets or markup.

Source links are relative to this file (`docs/plans/DESIGN_SYSTEM.md`).

## 1. Overview

### CSS file map

| File | Owns |
|---|---|
| [theme.css](../../../frontend/css/theme.css) | Shared light-theme tokens, body/page baseline, global focus ring, tactile `.key`, basic cards and `.field` controls, and shared schedule skeleton. |
| [dark-theme.css](../../../frontend/css/dark-theme.css) | Public Dark theme tokens and later, page/component-specific Dark overrides. It is excluded from the admin page. |
| [main.css](../../../frontend/css/main.css) | Earlier login/sign-up token set and legacy form, card, and authentication styles. It is loaded only by Login and Sign up. |
| [background.css](../../../frontend/css/background.css) | Public page canvas, particle and grid layers, theme toggle, transition state, and background motion. |
| [chrome.css](../../../frontend/css/chrome.css) | Shared signed-in/auth header and generated footer, navigation, account controls, skip link, and footer information dialog. |
| [responsive-chrome.css](../../../frontend/css/responsive-chrome.css) | Shared mobile navigation, responsive dialogs, device hover behavior, and reduced-motion adjustments. |
| [popup.css](../../../frontend/css/popup.css) | Custom modal/overlay, status icon, modal button variants, and Excel import dialog. |
| [custom-dropdown.css](../../../frontend/css/custom-dropdown.css) | Native-select replacement trigger, variants, menu, items, selected/active/action states, and responsive sizing. |
| [time-picker.css](../../../frontend/css/time-picker.css) | Custom time field, popover, step controls, scroll wheels, AM/PM choices, and save action. |
| [auth.css](../../../frontend/css/auth.css) | Login, sign-up, password reset, account creation layouts, inputs, password hints, verification, and auth-specific header styles. |
| [landing.css](../../../frontend/css/landing.css) | Public marketing landing page, hero, animated decorative schedule, and CTA treatments. |
| [dashboard.css](../../../frontend/css/dashboard.css) | Signed-in Home hero, schedule cards, draggable tool panels, and responsive greeting. |
| [builder.css](../../../frontend/css/builder.css) | Schedule Builder forms, event list, dock, edit and smart-schedule dialogs, and responsive workspace. |
| [plotter.css](../../../frontend/css/plotter.css) | Plotter schedule grid, blocks, options, color controls, export menu, and responsive canvas. |
| [profile.css](../../../frontend/css/profile.css) | Profile preferences, availability grid, profile carousel, setup onboarding carousel, and related controls. |
| [teams.css](../../../frontend/css/teams.css) | Teams schedule comparisons, team/member views, empty-team dialog, proposals, and mobile layouts. Includes historical compact/legacy rules. |
| [teams-settings.css](../../../frontend/css/teams-settings.css) | Team settings, member list, role actions, delete/manage layout. |
| [team-preferences.css](../../../frontend/css/team-preferences.css) | Team preference dialogs and preference list rows. |
| [admin.css](../../../admin/admin.css) | Admin dashboard, KPI cards, health/readiness states, filters, tables, charts, toast, skeletons, and admin breakpoints. Imports `theme.css`. |

### Stylesheet load order by page

Order is the order of `<link rel="stylesheet">` elements in each page. Later styles win where specificity is equal. The theme script sets the root attribute before the page is themed.

| Page | Load order |
|---|---|
| Landing [`index.html`](../../../index.html) | `landing.css` → `chrome.css` → `popup.css` → `dark-theme.css` → `responsive-chrome.css` |
| Home [`pages/home.html`](../../../pages/home.html) | `theme.css` → `dashboard.css` → `background.css` → `chrome.css` → `popup.css` → `dark-theme.css` → `responsive-chrome.css` |
| Builder [`pages/builder.html`](../../../pages/builder.html) | `theme.css` → `builder.css` → `background.css` → `chrome.css` → `popup.css` → `custom-dropdown.css` → `time-picker.css` → `dark-theme.css` → `responsive-chrome.css` |
| Plotter [`pages/plotter.html`](../../../pages/plotter.html) | `theme.css` → `plotter.css` → `custom-dropdown.css` → `background.css` → `chrome.css` → `popup.css` → `dark-theme.css` → `responsive-chrome.css` |
| Profile [`pages/profile.html`](../../../pages/profile.html) | `theme.css` → `profile.css` → `background.css` → `chrome.css` → `popup.css` → `custom-dropdown.css` → `dark-theme.css` → `responsive-chrome.css` |
| Setup/onboarding [`pages/setup.html`](../../../pages/setup.html) | `theme.css` → `auth.css` → `background.css` → `profile.css` → `chrome.css` → `popup.css` → `custom-dropdown.css` → `dark-theme.css` → `responsive-chrome.css` |
| Login [`pages/login.html`](../../../pages/login.html) | `main.css` → `theme.css` → `background.css` → `chrome.css` → `auth.css` → `popup.css` → `dark-theme.css` → `responsive-chrome.css` |
| Sign up [`pages/signup.html`](../../../pages/signup.html) | `main.css` → `theme.css` → `background.css` → `chrome.css` → `auth.css` → `popup.css` → `dark-theme.css` → `responsive-chrome.css` |
| Forgot password [`pages/forgot-password.html`](../../../pages/forgot-password.html) | `theme.css` → `auth.css` → `background.css` → `chrome.css` → `popup.css` → `dark-theme.css` → `responsive-chrome.css` |
| Teams [`pages/teams.html`](../../../pages/teams.html) | `theme.css` → `background.css` → `chrome.css` → `popup.css` → `teams.css` → `time-picker.css` → `team-preferences.css` → `custom-dropdown.css` → `dark-theme.css` → `responsive-chrome.css` |
| Team settings [`pages/teams-settings.html`](../../../pages/teams-settings.html) | `theme.css` → `background.css` → `chrome.css` → `popup.css` → `teams-settings.css` → `team-preferences.css` → `custom-dropdown.css` → `dark-theme.css` → `responsive-chrome.css` |
| Admin [`admin/index.html`](../../../admin/index.html) | `background.css` → `admin.css`; `admin.css` imports `theme.css` |

Stylesheet query versions differ by page and are cache-busting strings, not theme variants. Several shared styles are unversioned on some pages and versioned on others.

### Theme switching

[`theme.js`](../../../frontend/scripts/theme.js) reads `localStorage['schedula-theme']`, accepts only `light` or `dark`, and sets `document.documentElement.dataset.theme`. Dark selectors use `:root[data-theme="dark"]`; the default `:root` and `dark-theme.css` root block are Light. The toggle updates the stored value, SVG, accessible label, `aria-pressed`, and dispatches `schedula:themechange`. `theme-transitioning` is added for 180 ms.

The admin page does not load `dark-theme.css` or `theme.js`; it uses the shared Light tokens through the import in `admin.css`. `main.css`, `background.css`, `landing.css`, and `profile.css` contain older or page-scoped token sets that partially duplicate the common tokens. Dark mode remaps a subset of these on public pages; it does not automatically replace every hard-coded value.

Runtime styling state is also class/attribute-driven. These are current examples confirmed in the script sources:

| State | JS source | CSS state hook |
|---|---|---|
| Theme selection | `theme.js` | `:root[data-theme="dark"]`, `.theme-transitioning` |
| Login/sign-up submission | `auth.js` | `.is-processing`, `.is-locked` |
| Modal open/close | `popup.js`, `footer.js`, `scheduleExcel.js` | `.active`, `.is-closing` |
| Setup/profile carousel | `setup.js`, `profile.js` | `.active`, `.setup-final-save`, `.setup-next-btn` |
| Custom dropdown | `customDropdown.js` | `.block-level`, `.is-open`, `.is-selected`, `.is-active`, `.is-action`, `.has-open-dropdown`, `.custom-dropdown-menu--dialog` |
| Time picker | `timePicker.js` | `.time-picker-popover--floating`, `.is-expanded`, `.is-open`, plus `aria-expanded`, `aria-selected`, `aria-checked` |
| Plotter editor/export | `plotter.js` | `.is-selected`, `.selected`, `.is-block-selected`, `.has-overflowing-content`, `.is-overridden`, `.visible`, `.is-error` |
| Teams board/dialog | `teams.js`, `teamProposals.js` | `.team-view-mode`, `.member-view-mode`, `.is-active`, `.member-slide[aria-pressed]`, `.no-team-mode`, `.is-choice`, `.is-error`, `.is-visible` |
| Admin loading/views/toast | `admin.js` | `.is-loading`, `.has-entered`, `.admin-view[hidden]`, `data-visible`, `data-kind`, `data-loaded` |

The page files also use inline styles/custom properties: hidden SVG defs and conditional hidden sections use inline `style`; Plotter swatches set `--swatch-color`; Home sets `--panel-top` and `--panel-hours`; Teams sets `--member-timeline-height` and `--team-member-count`; Admin templates set `--i`. Treat these runtime values as part of the component contract.

## 2. Design tokens

This is an inventory of defined custom properties (including component-local and runtime-set properties), not a claim that every hard-coded declaration already uses them. `—` means the property has no dedicated Dark value and therefore keeps its Light/declared value unless a more specific rule overrides the element.

The shared token block is defined directly in [`theme.css`](../../../frontend/css/theme.css), then core colors are mapped in [`dark-theme.css`](../../../frontend/css/dark-theme.css):

```css
:root { --page:#fff; --surface:#fff; --ink:#2a1245; --accent:#62298a; }
:root[data-theme="dark"] { --page:#151719; --surface:#1e2023; --ink:#eceef0; --accent:#b6acbf; }
```

### Core palette and state colors

| Name | Light value | Dark value | Used for | Defined / used in |
|---|---|---|---|---|
| `--page` | `#fff` (theme); `#f8fafc` in dark-theme Light defaults | `#151719` | App canvas | `theme.css`, `dark-theme.css`; base/page backgrounds |
| `--surface` | `#fff` | `#1e2023`; auth/profile/setup scopes map it to `--surface-raised` (`#282b2f`) | Main surface | `theme.css`, `dark-theme.css`; shared panels/components |
| `--surface-raised` | `#fff` | `#282b2f` | Raised cards, controls, and dialogs | `theme.css`, `dark-theme.css`; dark overrides |
| `--surface-inset` | `#f8f6fa` | `#191b1e` | Inset fields and wells | `theme.css`, `dark-theme.css`; dark form rules |
| `--ink` | `#2a1245` | `#eceef0` | Main foreground | `theme.css`, `dark-theme.css`; shared body/component rules |
| `--muted-ink` | `#655b70` | `#a9adb3` | Secondary text | `theme.css`, `dark-theme.css`; body copy/labels |
| `--line` | `rgba(42,18,69,.18)` | `#3d4147` | Shared borders | `theme.css`, `dark-theme.css`; surfaces/controls |
| `--accent` | `#62298a` | `#b6acbf` | Brand/accent | `theme.css`, `dark-theme.css`; shared elements |
| `--accent-strong` | `#4a1d6d` | `#cbc3d2` | Strong accent | `theme.css`, `dark-theme.css` |
| `--focus-ring` | `#62298a` | `#c0b7c8` | Keyboard outline | `theme.css`, `dark-theme.css` |
| `--key-face` | `#f2e8fa` | `#34363a` | Key/button face token | `theme.css`, `dark-theme.css` |
| `--key-edge` | `#62298a` | `#5b5e64` | Raised button edge | `theme.css`, `dark-theme.css` |
| `--particle` | `rgba(124,58,237,.55)` | `rgba(190,190,198,.3)` | Decorative particles | `theme.css`, `dark-theme.css` |
| `--shadow-tint` | `rgba(42,18,69,.22)` | `rgba(0,0,0,.48)` | Shared shadow tint | `theme.css`, `dark-theme.css` |
| `--skeleton-base` | `#e8dff0` | `#292c30` | Loading shimmer base | `theme.css`, `dark-theme.css`; `theme.css` skeleton |
| `--skeleton-highlight` | `#f7f3fa` | `#383c41` | Loading shimmer highlight | `theme.css`, `dark-theme.css`; `theme.css` skeleton |
| `--lav` | `#b596c8` | — | Legacy lavender accent | `theme.css`; admin/profile/custom controls |
| `--plum` | `#2a1245` | — (Dark rules often set component foreground explicitly) | Legacy brand foreground | `theme.css`; several page/component files |
| `--purple` | `#62298a` | — | Legacy purple accent | `theme.css`; page/component files |
| `--purple-dark` | `#4a1d6d` | — | Legacy deep purple | `theme.css`; time picker/admin/page styles |
| `--lav-light` | `#e6d6f1` | — | Light lavender state | `theme.css`; time picker/admin |
| `--surface-white` | `#fff` | `var(--surface)` | Legacy white-surface alias | `theme.css`, `dark-theme.css`; admin/time picker |
| `--overlay` | `rgba(42,18,69,.62)` | `rgba(5,6,8,.78)` | Dialog backdrop | `dark-theme.css`; public overlays |
| `--bg` | `#f8fafc` in `background.css`/`landing.css`; `#f5f5f7` in `main.css`; profile `#f8fafc` | `var(--page)` in dark body scopes | Legacy page background alias | `background.css`, `landing.css`, `main.css`, `profile.css`, `dark-theme.css` |
| `--fg` | `#2a1245`; legacy blocks also use `#0f172a` | `var(--ink)` | Legacy foreground alias | `background.css`, `landing.css`, `dark-theme.css` |
| `--text` | `#2a1245`; legacy blocks also use `#0f172a` | `var(--ink)` in selected scopes | Legacy foreground alias | `background.css`, `main.css`, `profile.css`, `dark-theme.css`, `time-picker.css` |
| `--muted` | `#5b4778` or `#655b70`; legacy block also `#475569` | `var(--muted-ink)` in selected scopes | Legacy secondary text alias | `background.css`, `landing.css`, `main.css`, `profile.css`, `dark-theme.css` |
| `--border` | `rgba(42,18,69,.14/.16)`; legacy lavender block `rgba(139,92,246,.12)` | `rgba(190,193,198,.2)` or `var(--line)` | Legacy border alias | `background.css`, `landing.css`, `main.css`, `profile.css`, `dark-theme.css` |
| `--accent2` | `#a27cb7`; legacy `#8b5cf6` | — | Secondary background accent | `background.css`, `landing.css` |
| `--glass` | `rgba(255,255,255,.78)`; legacy `.72/.6` | `rgba(30,32,35,.92)` on background scopes | Header/footer glass | `background.css`, `landing.css`, `profile.css`, `dark-theme.css`, `chrome.css` |

### Semantic status colors

The `--admin-*` palette is defined in the shared root and used by admin status chips and success/danger/warning buttons. No separate Dark values are defined; admin itself has no Dark theme.

| Names | Light values (top / mid / bottom / edge / ink) | Dark value | Used for | Files |
|---|---|---|---|---|
| `--admin-success-top`, `--admin-success-mid`, `--admin-success-bottom`, `--admin-success-edge`, `--admin-success-ink` | `#e2f7e9`, `#b6e5c6`, `#8bd2a4`, `#28613b`, `#164d2c` | — | Success chips/buttons/messages | `theme.css`, `admin.css` |
| `--admin-warning-top`, `--admin-warning-mid`, `--admin-warning-bottom`, `--admin-warning-edge`, `--admin-warning-ink` | `#fff1cc`, `#f5cd70`, `#e6ad35`, `#8f6717`, `#4b3500` | — | Warning chips/buttons | `theme.css`, `admin.css` |
| `--admin-danger-top`, `--admin-danger-mid`, `--admin-danger-bottom`, `--admin-danger-edge`, `--admin-danger-ink` | `#ffe5e5`, `#f6bcbc`, `#ec999d`, `#8c3340`, `#751f2c` | — | Danger chips/buttons/errors | `theme.css`, `admin.css` |
| `--flag` | `#c2255c` | — | Profile/availability marker | `theme.css`, `profile.css` |

### Typography, spacing, radii, shadow, and motion properties

| Name | Light value | Dark value | Used for | Defined / used in |
|---|---|---|---|---|
| `--radius-container` | `16px` in `main.css`; `24px` in `profile.css` | — | Large cards | `main.css`, `profile.css`; conflicting values |
| `--radius-button` | `12px` in `main.css`; `14px` in `profile.css` | — | Button radius | `main.css`, `profile.css`; conflicting values |
| `--radius-inline` | `8px` | — | Inline controls | `main.css` |
| `--radius-admin-chip` | `13px` | — | Admin status chip | `theme.css`, `admin.css` |
| `--radius-admin-pill` | `999px` | — | Admin env/role pill | `theme.css`, `admin.css` |
| `--row` | `56px` root; 48px dashboard/builder; 60px plotter; 34px legacy Teams mobile | — | Schedule row sizing | `theme.css`, `dashboard.css`, `builder.css`, `landing.css`, `plotter.css`, `teams.css` |
| `--rows` | `7` | — | Home schedule rows | `dashboard.css` |
| `--hd` | `44px` | — | Plotter header sizing | `plotter.css` |
| `--app-chrome-max` | `1200px` | — | Legacy auth chrome max | `main.css`, `chrome.css` |
| `--app-chrome-gutter` | `24px` | — | Legacy auth chrome gutter | `main.css` |
| `--app-chrome-width` | `min(var(--app-chrome-max), calc(100% - 2 * var(--app-chrome-gutter)))` | — | Derived chrome width | `main.css`, `chrome.css` |
| `--panel` | `#fff` in `main.css` | `var(--surface)` on selected dark scopes | Legacy panel fill | `main.css`, `dark-theme.css` |
| `--panel-glass` | `rgba(255,255,255,.88)` then `.78` in the second root; profile uses `#fff` | `var(--surface)` on auth/profile/setup scopes | Legacy translucent panel fill | `main.css`, `profile.css`, `dark-theme.css` |
| `--panel-border-glass` | `rgba(42,18,69,.14)` then `rgba(124,58,237,.16)`; profile uses `#fff` | `var(--line)` on auth/profile/setup scopes | Legacy panel border | `main.css`, `profile.css`, `dark-theme.css` |
| `--panel-shadow-glass` | Plum shadow then violet shadow in `main.css` second root | — | Legacy panel shadow | `main.css` |
| `--input-bg` | `#fff` | `var(--surface-inset)` in selected dark scopes | Legacy field fill | `main.css`, `profile.css`, `dark-theme.css`, `time-picker.css` |
| `--transition-fast` | `160ms cubic-bezier(.23,1,.32,1)` | — | Legacy transition | `main.css` |
| `--transition-normal` | `280ms cubic-bezier(.23,1,.32,1)` | — | Legacy transition | `main.css` |
| `--ease-out` | `.23,1,.32,1` curve (theme); equivalent `0.23,1,0.32,1` (main) | — | Button/UI easing | `theme.css`, `main.css` |
| `--ease-in-out` | `cubic-bezier(.77,0,.175,1)` | — | Shared easing token | `theme.css` |
| `--ease-drawer` | `cubic-bezier(.32,.72,0,1)` | — | Drawer easing token | `theme.css` |
| `--dur-press` | `110ms` | — | Key press transitions | `theme.css` |
| `--dur-ui` | `180ms` | — | Key color/border transitions | `theme.css` |
| `--dur-surface` | `240ms` | — | Surface transition token | `theme.css` |
| `--popup-radius` | `18px` | same | Modal radius | `popup.css` |
| `--popup-shadow` | `0 24px 64px rgba(20,8,36,.48)` | same | Modal shadow token | `popup.css` |
| `--shadow-admin-pressed` | `inset 0 2px 5px rgba(42,18,69,.25), 0 0 0 transparent` | — | Admin pressed key | `theme.css`, `admin.css` |
| `--shadow-admin-success-key` | `inset 0 1px 0 #fff, 0 4px 0 var(--admin-success-edge)` | — | Admin success key | `theme.css`, `admin.css` |
| `--shadow-admin-danger-key` | `inset 0 1px 0 #fff, 0 4px 0 var(--admin-danger-edge)` | — | Admin danger key | `theme.css`, `admin.css` |
| `--shadow-admin-warning-key` | `inset 0 1px 0 #fff, 0 4px 0 var(--admin-warning-edge)` | — | Admin warning key | `theme.css`, `admin.css` |
| `--panel-glass`, `--panel-border-glass`, `--panel-shadow-glass` | Vary across legacy sets: white `.88/.78` glass; plum/gray and violet-tint borders/shadows | No complete Dark pair; selected scopes remap to `--surface`/`--line` | Legacy panel token trio | `main.css`, `profile.css`, `dark-theme.css` |
| `--grid-line`, `--radial-glow`, `--center-glow` | Main legacy values use plum at `.035/.06/.035`; second main root uses violet at `.04/.05/.02` | — | Legacy background decoration | `main.css` |
| `--accent-gradient`, `--accent-rgb`, `--accent-skeuo-border` | Plum: `linear-gradient(#8f5caf,#62298a)`, `98,41,138`, `rgba(98,41,138,.35)`; main legacy second root uses violet values | — | Legacy accent recipes | `main.css`; `profile.css` has its own `--accent-rgb` (`122,63,181`) and skeuo border |

### Component and page-scoped custom properties

| Name | Light value | Dark value | Used for | Defined / used in |
|---|---|---|---|---|
| `--auth-card` | `rgba(255,255,255,.82)` | `var(--surface)` | Auth card | `auth.css`, `dark-theme.css` |
| `--auth-card-edge` | `rgba(42,18,69,.14)` | `var(--line)` | Auth card border | `auth.css`, `dark-theme.css` |
| `--auth-input` | `#fff` | `var(--surface-inset)` | Auth fields | `auth.css`, `dark-theme.css` |
| `--auth-input-edge` | `rgba(42,18,69,.18)` | `var(--line)` | Auth field border | `auth.css`, `dark-theme.css` |
| `--auth-heading` | `#2a1245` | `var(--ink)` | Auth headings | `auth.css`, `dark-theme.css` |
| `--auth-muted` | `#5b4778` | `var(--muted-ink)` | Auth secondary copy | `auth.css`, `dark-theme.css` |
| `--auth-plum` | `#2a1245` | `var(--ink)` | Auth brand foreground | `auth.css`, `dark-theme.css` |
| `--auth-accent` | `#8b5cf6` | `var(--accent)` | Auth accent | `auth.css`, `dark-theme.css` |
| `--popup-bg`, `--popup-bg-light` | `#fff`, `#fff` | `var(--surface)`, `var(--surface-raised)` | Popup surfaces | `popup.css`, `dark-theme.css` |
| `--popup-text`, `--popup-text-light` | `#2a1245`, `#2a1245` | `var(--ink)`, `var(--ink)` | Popup text | `popup.css`, `dark-theme.css` |
| `--popup-muted`, `--popup-muted-light` | `#5b4778`, `#5b4778` | `var(--muted-ink)`, `var(--muted-ink)` | Popup secondary text | `popup.css`, `dark-theme.css` |
| `--popup-border`, `--popup-border-light` | `rgba(42,18,69,.16)`, `rgba(42,18,69,.16)` | `var(--line)`, `var(--line)` | Popup border | `popup.css`, `dark-theme.css` |
| `--popup-purple`, `--popup-purple-dark` | `#8b5cf6`, `#62298a` | No token remap; Dark component rules override popup surfaces/actions | Popup accent pair | `popup.css`, `dark-theme.css` |
| `--footer-fg`, `--footer-muted`, `--footer-border`, `--footer-glass` | Fallbacks from `--fg/--text`, `--muted`, `--border`, and `--glass/--panel` | Inherit values set on Dark page scopes | Footer appearance aliases | `chrome.css`; values are fallbacks, not independent theme declarations |
| `--bezel`, `--bezel-shadow`, `--edge`, `--hair`, `--well` | White bezel; purple edge; profile-specific shadow/hairline; lavender well | Bezel=`var(--surface)`, shadow=`inset 0 0 0 1px rgba(210,212,216,.1), 0 8px 24px var(--shadow-tint)`, edge=`var(--key-edge)`, well=`#1d1f22`; `--hair` remains Light | Profile control construction | `profile.css`, `dark-theme.css` |
| `--accent-rgb` (profile) | `122,63,181` | — | Profile accent RGB | `profile.css` |
| `--teams-plum`, `--teams-purple`, `--teams-lavender` | `#2a1245`, `#62298a`, `#b596c8` | — | Teams legacy aliases | `teams.css` |
| `--kt`, `--km`, `--kb`, `--ks`, `--kd` | Primary key top/mid/bottom/edge/depth: `#d9c2ec`, `#bb99d2`, `#a27cb7`, `#4a1d6d`, `5px`; danger variant switches to rose/red and `#7d1239` | Not directly remapped as tokens | Profile primary/danger button recipes | `profile.css` |
| `--i` | Per-element numeric index | same | Stagger delay | `landing.css`, `admin.css`; inline in `admin.js` |
| `--top` | No definition or runtime assignment found; referenced by `.tool` in `dashboard.css` | no definition | Legacy Home tool top position | `dashboard.css`; `.home-tool-panel` uses separately assigned `--panel-top` |
| `--panel-top`, `--panel-hours` | Runtime minute/height values set from Home block positions | same | Home draggable schedule-card geometry | `dashboard.css`; set in inline Home script |
| `--hd`, `--row` | `44px`, `60px` | same | Plotter column/row dimensions | `plotter.css` |
| `--block-font-scale` | Fallback `1`; values are block-dependent when assigned | same | Plotter event label scaling | `plotter.css`; set by plotter rendering |
| `--swatch-color` | Inline selected hex swatch value | user-selected value | Plotter swatch paint | `plotter.css`, `pages/plotter.html`, `plotter.js` |
| `--member-timeline-height` | Runtime pixel height | same | Member timetable body/columns | `teams.css`; set by `teams.js` |
| `--team-member-count` | Runtime count (fallback `1`) | same | Team table row tracks | `teams.css`; set by `teams.js` |
| `--header-fg` | No definition found; `chrome.css` uses it with fallback `#f4f4f5` | no definition | Optional header foreground alias | Referenced in `chrome.css`; candidate unused token |

No custom properties currently define a shared spacing scale, type scale, border-width scale, or z-index scale. Those values are hard-coded in component/page rules.

### Duplicates and hard-coded token candidates

- `theme.css` defines shared base values; `dark-theme.css` also declares Light fallback values for core `--page`, `--surface`, `--ink`, and accent tokens. The page background defaults differ (`#fff` vs `#f8fafc`).
- `main.css` defines two `:root` blocks with different palettes: plum (`#2a1245` / `#62298a`) and a second slate/violet legacy palette (`#0f172a` / `#7c3aed`). Because the second block is later, it wins for its repeated names before `theme.css` and `dark-theme.css` load.
- `background.css` and `landing.css` each redeclare `.schedula-background`-style tokens, including two different Light palettes within the same file. Profile sets another page-scoped palette. A future token cleanup should resolve precedence rather than add another alias.
- `--radius-container` (`16px` vs `24px`) and `--radius-button` (`12px` vs `14px`) conflict between `main.css` and `profile.css`. Hard-coded component radii also include 8, 9, 10, 11, 12, 14, 16, 18, 22, 24, and 28px in page/component CSS.
- Common hard-coded colors persist in component/page styles despite `--ink`, `--line`, `--accent`, `--surface`, and status tokens: e.g. `#2a1245`, `#62298a`, `#f2e8fa`, and `#fff` in buttons, forms, cards, and dialogs. Not all are equivalent roles; audit before replacing.
- Spacing is almost entirely literal (`4–56px` in components; page gutters range 12–44px). No shared spacing scale exists. Most component heights and focus outline widths are also literal.

## 3. Typography

| Role | Current definition | Where |
|---|---|---|
| Main family | `"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif` | `theme.css` body/fields/keys; `background.css` and `landing.css` import the Google font. |
| Profile family | `"Bricolage Grotesque", "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif` | `profile.css` body; Plus Jakarta Sans is only a fallback. |
| Admin family | Bricolage with system fallback | `admin.css` `.admin-page` and table code/preformatted values. |
| Base | `18px / 1.5` | `theme.css` body. Admin resets to `16px / 1.5`. |
| Home h1 | `clamp(3.2rem, 6vw, 6rem)`, `.9` line-height; mobile `clamp(3.4rem,14vw,5rem)`, `.84` | `dashboard.css`; mobile override ≤700px. |
| Auth h1 | `clamp(3rem,5.5vw,5.5rem)`, `.92` | `auth.css`; auth card heading becomes 36px ≤600px. |
| Builder page h1 | `clamp(2.8rem,5.2vw,4.8rem)`, `.92` | `builder.css` `.page-title h1`. |
| Landing h1 | Hero title sizes vary between base and small-screen declarations; primary `.hero-title` is in the legacy portion of `landing.css`, with additional later responsive rules. | `landing.css`; verify which selector set is live before consolidating. |
| Admin page h1 | `clamp(28px,3vw,38px)`, `1.05` | `admin.css`. |
| Key/buttons | Shared `.key`: `700 16px/1`; `.key.sm`: 14px. Many component buttons override with 12–18px and local line-height. | `theme.css`, plus page CSS. |
| Form labels | Shared `.field span`: 13px, 800 weight, uppercase, `.06em` tracking. Other page labels vary 10–15px. | `theme.css`, `profile.css`, `auth.css`, `admin.css`, page CSS. |
| Schedule/table metadata | Typically 10–14px; table heads uppercase and tracked, admin `th` 11px. | Builder, Plotter, Teams, Admin. |

Most large titles use Bricolage’s variable width setting (`font-variation-settings: "wdth" 80`) and tight negative tracking. There is no centralized type-scale token; sizes/weights/line-heights are literals and repeated with small differences.

## 4. Layout

### Shells and common patterns

- `.page` in `theme.css`: full width, `max-width:1280px`, centered; `28px 32px 56px` padding; grid rows `auto 1fr`; `24px` gap. Many pages override padding/height.
- Shared header `.app-shell-header` in `chrome.css`: centered flex/grid-like chrome with brand, nav, tools, account, and buttons; responsive layout changes at 800/560/380px.
- Home `.hero`: desktop 5:7 two-column grid; single column ≤1080px; tool panel grid becomes one column ≤720px.
- Auth hero/card uses 5:7 columns; switches to one column ≤1080/900px, auth visual hides ≤600px.
- Builder `.work` uses a form/list multi-column arrangement; tablet/phone switches columns and toolbar flow at 1080/720/600/560/520px.
- Plotter schedule canvas uses a time axis plus seven day columns, with CSS grid variables `--hd` and `--row`; controls adapt at 820/700/520px.
- Profile uses account/details columns and preference carousel; stacked at 1000/860/800/600px depending on section.
- Teams board uses comparison grid/team rows and a horizontally scrollable member timetable; mobile switches Team View to stacked member cards and keeps Member View as a scrollable week grid.
- Admin uses a 220px sidebar plus fluid workspace; collapses to one column at 1080px and compresses tables/forms/KPIs at 720px and 380px.

### Every responsive/media query found

| File | Queries |
|---|---|
| `theme.css` | `(hover: hover) and (pointer: fine)`; `(prefers-reduced-motion: reduce)` |
| `main.css` | `max-width:600px` |
| `background.css` | `prefers-reduced-motion: reduce` |
| `chrome.css` | `max-width:800px`, `560px`, `380px`; footer `600px` |
| `responsive-chrome.css` | `max-width:700px`, `600px`, `380px`; fine pointer, no-hover, reduced motion |
| `popup.css` | `max-width:520px` |
| `custom-dropdown.css` | `max-width:720px` |
| `time-picker.css` | `max-width:360px` |
| `auth.css` | `max-width:1080px`, `720px`, `900px`, `600px` |
| `landing.css` | `max-width:600px` (multiple sections); nested `900px`, `600px`; reduced motion |
| `dashboard.css` | `max-width:1080px`, `720px`, `700px`, `520px` |
| `builder.css` | `max-width:560px`, `600px`, `1080px`, `720px`, `520px` |
| `plotter.css` | `max-width:820px`, `520px`, `700px` |
| `profile.css` | `max-width:800px`, `600px` (multiple), `1000px`, `720px`, `860px`; reduced motion |
| `teams.css` | `max-width:800px` (multiple), `600px` (multiple), `1080px`, `720px`, `520px`, `700px`; reduced motion |
| `teams-settings.css` | `max-width:800px`, `520px`; reduced motion |
| `team-preferences.css` | `max-width:560px`; reduced motion |
| `dark-theme.css` | `max-width:600px`; `prefers-reduced-motion:no-preference`; reduced motion |
| `admin.css` | `max-width:1080px`, `720px`, `380px`; reduced motion |

## 5. Shared element styles

### Buttons

| Concern | Current selectors / source | Variants and states | Key declarations / usage |
|---|---|---|---|
| General raised key | `.key`, `.key.lav`, `.key.sm`, `.key.icon`, `[aria-current="page"]` in `theme.css` | Lavender/white face; hover lift on fine pointers; active press; disabled opacity/press | Bricolage bold; 14px radius (12px small); purple raised shadow; SVG 18px. Used throughout all public/admin pages. |
| Builder action family | `.btn-primary`, `.btn-remove`, `.btn-icon` in `builder.css` | Default/lavender, remove, hover/active/disabled | 12px radius, raised gradient/shadow; buttons share primary/remove geometry. Builder and smart schedule. |
| Profile actions | `.btn-primary`, `.btn-danger` in `profile.css` | Danger swaps CSS custom properties to rose; hover/active | Uses `--kt/--km/--kb/--ks/--kd`; profile/preferences/setup. |
| Auth actions | `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.signup-btn` in `auth.css`; legacy `.primary` in `main.css` | Processing, locked, disabled, submit; hover/focus declared selectively | Auth button colors and sizing are locally defined; dark theme generic keys may restyle common buttons. |
| Modal actions | `.custom-modal-btn.{primary,success,warning,error,secondary}` in `popup.css` | Variant-specific fills; hover and active; disabled | Five semantic variants, local gradients and press shadows. |
| Admin semantic keys | `.key.success/.danger/.warning` in `admin.css` | Active and disabled | Semantic tokens; admin does not load Dark theme. |
| Dark overrides | `dark-theme.css` shared `.key`, `.btn-primary`, `.button.primary`, dialog/team actions, explicit green save/smart schedule, purple creation/generation | Active, hover, disabled, special green actions and semantic actions | Broad selectors with `!important` coexist with component rules; page-specific action role is partly encoded by ID. |

Canonical existing markup:

```html
<button id="smart-schedule-btn" class="btn-primary btn-save smart-schedule-btn" type="button"
        aria-haspopup="dialog" aria-controls="smart-schedule-dialog">Smart Schedule</button>
<button class="key sm" type="button">Continue</button>
```

The first example is from [`pages/builder.html`](../../../pages/builder.html); the second is the shared key pattern. Prefer one base class plus explicit semantic variant (primary/secondary/danger/success) rather than new IDs solely for paint.

### Inputs, textareas, selects, labels, and form groups

| Concern | Selectors / source | Key declarations and states |
|---|---|---|
| Shared fields | `.field`, `.field span`, `.field input/select/textarea`, placeholder, disabled in `theme.css` | Vertical label+control group; label 13px uppercase; controls full width, 16px semibold, 12px radius, 2px border, inset white fill. Placeholder opacity/color and disabled fill are explicit. |
| Auth | `.auth-page .field input`, password wrappers, PIN, password tooltip in `auth.css` | Dedicated auth sizing, reveal controls and requirement tooltip; focus/input/error rules vary by form. |
| Profile/setup | `.profile-select-group`, `fieldset.preference-radio-group`, `.preference-group`, `.preference-check-grid` in `profile.css` | Select/radio/checkbox/check-grid treatments; setup reuses these styles. |
| Builder/Teams | `.field` markup plus page-specific form grids; custom `data-time-picker` text input | Custom dropdown/time-picker scripts enhance native controls. |
| Dark theme | `input/select/textarea`, placeholder, native select arrows, custom controls in `dark-theme.css` | Dark inset fill, ink, line, focus and placeholder overrides; page-specific exceptions remain. |

Real form pattern from Builder:

```html
<label class="field"><span>Title</span><input id="event-title" type="text" required></label>
<label class="field"><span>Start time</span><input id="event-start" type="text" data-time-picker inputmode="numeric"></label>
```

### Validation, errors, and messages

- Auth banner `#message-banner` in `auth.css`; `.team-status` in `teams.css`; builder `.text-error-center`/`.is-error`; `.preferences-message.is-error`, `#no-teams-message`, smart-schedule warnings and proposal status in page/dialog CSS.
- `popup.css` provides success/warning/error modal title/icon/button variants.
- Admin `.admin-message[data-kind=error|success]`, `.admin-load-error`, and `.admin-toast[data-visible]` use status tokens/classes.
- `dark-theme.css` contains shared dark error/success/warning mappings, but some component-specific status colors are hard-coded locally. Verify contrast for each inline/dynamic state.

### Cards and panels

- Shared `.card` in `theme.css`: 24px radius, white fill, white border, inset top/bottom accents, 6px purple step and shadow. `.card h2` 1.6rem/1.1. Auth/Profile/Teams/Builder each add card aliases or replace those surfaces.
- `dark-theme.css` groups `.card`, `.well`, `.lane`, `.page-panel`, dialog/card suffix patterns into surface, line, and shadow overrides.
- Page-specific panels: Builder `.page-panel/.event-form-panel`; auth `.login-card/.auth-visual`; profile `.pf-panel/.profile-step-panel`; Plotter workspace/option panels; Teams board/dock/member panels; Admin `.admin-panel/.admin-kpis/.admin-health-card`.
- Surface radius and shadow recipes are repeated and differ across files; see §6.

### Modals and popups

- `.custom-modal-overlay` and `.custom-modal` in `popup.css`: fixed overlay `z-index:40`, blur, opacity/transform enter/close transition; width ≤440px, max-height 80vh/640px, radius token; status variants and action group.
- Excel import modal `.schedule-excel-modal` adds dropzone, file name/status/summary/action sections.
- Native `<dialog>` and page-specific dialogs exist for Smart Schedule, profile preferences, team preferences/proposals, no-team, and team forms. They are owned by page CSS, `team-preferences.css`, and Dark overrides, not by one modal primitive.
- `responsive-chrome.css` constrains dialogs on mobile. `team-preferences.css` animates open dialogs and turns off those animations under reduced motion.
- Headers, bodies, and footers on several page dialogs were explicitly reset to transparent/no border in `dark-theme.css`; this should be a component contract rather than another generic suffix reset.

### Toasts and messages

- Public Teams `.team-status` uses fixed centered placement, enter animation, and `is-error/is-success`; `teams.js` toggles visibility and status classes.
- Admin `.admin-toast[data-visible="true"]` enters from below; `admin.js` sets `data-visible` and `data-kind` on message states.
- Popup modal messages are distinct from transient toasts. No single public toast component contract is shared by every page.

### Tables, timetables, and tabs

- Admin `.table-scroll` wraps `.admin-table`; collapse borders, 14px text, 11px uppercase headers, bottom row lines. Audit/error tables have fixed minimum widths; mobile user table transforms rows into labeled grid cells at ≤720px.
- Builder event list and Plotter schedule are CSS grid/flex schedules rather than semantic `<table>`; Builder groups by weekday; Plotter uses `--hd`/`--row`.
- Teams Team View is a comparison board; Member View is `.member-timetable` with axis and day columns. `teams.js` toggles `.team-view-mode`/`.member-view-mode` on `#board` and uses pressed states on view buttons/member slides.
- Plotter tabs use `.plotter-tabs/.plotter-tab` with selected classes/ARIA; team view buttons use `.team-view-switch/.team-view-option.is-active`. Profile and setup are multi-step carousels rather than tab widgets.

### Badges and chips

- Admin `.health-chip[data-status=ok|degraded|down]`, `.admin-env`, `.admin-role`, and `.admin-pagination` use success/warning/danger/root tokens and pill radius.
- Teams member role/status, proposal review count, group code and free-count are page-specific badges; `dark-theme.css` has corresponding muted mappings.
- Profile availability flags use `--flag`; Plotter color selections use `.color-swatch.is-selected` ring; no universal public badge class is defined.

### Header, footer, and navigation

- `chrome.css` defines `.app-shell-header`, `.brand`, `.mark`, `.nav`, `.acct`, `.avatar`, header keys, active nav, and `.site-footer` variants. Header buttons are 42px; account is pill shaped; brand mark 48px in shared base.
- Footer is generated by `footer.js` as `.site-footer.site-footer--hero|--static`; includes information links/modal, skip link, and a `mobile-primary-nav` added when the viewport warrants it.
- `responsive-chrome.css` handles mobile bottom nav. `background.css` also gives `.theme-toggle` base glass treatment; header-specific rules override it.
- Public pages use different header markup (auth versus signed-in versus landing), and some pages load `chrome.css` with `data-schedula-header`/`data-site-footer` markers consumed by scripts.

### Custom dropdown

- `customDropdown.js` replaces eligible `<select>` controls with `.custom-dropdown-wrap`, `.custom-dropdown-btn`, label/arrow and `.custom-dropdown-menu`/items, while retaining a hidden native select.
- Variants: `.variant-key-lavender`, `.variant-key-white`, `.variant-filter`, `.variant-field`. States include hover, active/open, selected/active item, action item, disabled, focus-visible, and dialog-floating menu.
- Menu is z-index 30, max-height 280px, width capped 360px/92vw, thin lavender scrollbar. Mobile changes team toolbar sizing ≤720px.
- Variant paint values and transitions are largely literal; Dark theme restyles generic controls and menu entries.

### Time picker

- `timePicker.js` wraps `input[data-time-picker]` with `.time-picker-trigger` and `.time-picker-popover`; native input remains visually hidden but present. Popover can become `--floating` and is z-index 45.
- Parts: heading, step controls, hour/minute wheel toggle, wheel options, AM/PM `aria-checked` buttons, save, and chevron. Open/expanded/selected/active/focus states are coded in `time-picker.css` and `dark-theme.css`.
- Wheel scrollbars are hidden; wheel uses scroll snap and fades via mask. Popover is 360px max; ≤360px reduces control columns.

### Color picker

- Plotter `.color-picker-group`, `.color-swatches`, `.color-swatch`, `.color-input-wrapper`, hex text and native color inputs are defined in `plotter.css`.
- Swatch face uses inline `--swatch-color`; `.is-selected` uses a ring. `plotter.js` toggles selection and `aria-pressed`. The Dark theme keeps user-selected block/text colors rather than applying a global paint to plotted blocks.

### Loaders and skeletons

- `.schedule-skeleton` and its animated spans/keyframe are in `theme.css`, using `--skeleton-base` and `--skeleton-highlight`; Dark values are in `dark-theme.css`.
- Admin variants `.admin-kpi-skeleton`, `.admin-chip-skeleton`, `.admin-skeleton-chart`, `.admin-skeleton-table`, `.admin-skeleton-health` resize the shared spans; admin does not load Dark theme.
- Landing has separate decorative `shimmer` animation for grid line passes; it is not the schedule skeleton.

### Empty states and scrollbars

- Builder `.events-empty-state`; Plotter empty schedule list item; Teams no-team dialog and `.team-empty`; Admin `.admin-empty` and skeleton/error states. These are not unified under one empty-state component.
- Scrollbars: Builder `.events-list` thin custom track/thumb; custom dropdown and Teams member slider use Firefox `scrollbar-color`; Plotter/team schedules use overflow regions; time-picker wheel hides the scrollbar; Chrome footer stabilizes gutter. Dark theme sets a generic scrollbar color around relevant fields.
- Plotter, Team Member timetable, and mobile board overflow areas have different touch/overscroll behavior. Document a reusable scroll-region primitive before merging them.

## 6. Duplicated styles inventory

“Identical?” compares intent/role, not textual equality. Exact source has duplicate blocks within some files as well as repeated declarations between pages.

| Style | Files where repeated | Identical? | Proposed home |
|---|---|---|---|
| Root color aliases (`--bg`, `--text`, `--accent`, `--border`, `--surface`) | `theme.css`, `main.css`, `background.css`, `landing.css`, `profile.css`, `dark-theme.css` | No; multiple conflicting light palettes | `tokens.css` plus a single explicit Light/Dark token map; page-only aliases scoped separately |
| Raised `.key` buttons | `theme.css`, `chrome.css`, `builder.css`, `profile.css`, `auth.css`, `teams.css`, `teams-settings.css`, `team-preferences.css`, `admin.css` | Same skeuomorphic idea, not identical dimensions/colors/states | `components/buttons.css` with base and semantic variants; page layout rules stay local |
| Form controls | `theme.css`, `main.css`, `auth.css`, `profile.css`, `teams.css`, `teams-settings.css`, `custom-dropdown.css`, `time-picker.css`, `admin.css` | No; control heights/radii/borders vary | `components/forms.css`; specialized dropdown/time-picker layers |
| White/lavender card recipes | `theme.css`, `main.css`, `auth.css`, `profile.css`, `builder.css`, `dashboard.css`, `teams.css`, `teams-settings.css`, `popup.css`, `admin.css` | No; radius/shadow/border depths differ | `components/surfaces.css` with flat/inset/raised variants |
| Modal/dialog surface | `popup.css`, `auth.css`, `profile.css`, `team-preferences.css`, `teams.css`, `teams-settings.css`, `dark-theme.css` | No; custom overlay versus native dialog and per-page content | `components/dialog.css` for shell/backdrop; dialog content remains feature-local |
| Theme toggles/header keys | `background.css`, `chrome.css`, `auth.css`, `dark-theme.css` | Related, but different transparent/raised contexts | `components/header.css` plus light/dark state tokens |
| Labels and form group captions | `theme.css`, `auth.css`, `profile.css`, `builder.css`, `plotter.css`, `teams.css`, `teams-settings.css`, `admin.css` | No; 10–15px and title case/uppercase vary | `components/forms.css` with explicit label variants |
| Focus rings | `theme.css`, `main.css`, `auth.css`, `custom-dropdown.css`, `time-picker.css`, `profile.css`, `teams.css`, `admin.css`, `dark-theme.css` | No; 2–4px, different offsets and colors | shared focus token/utility and component-owned offsets |
| `drop` keyframe | `builder.css`, `dashboard.css`, `landing.css`, `admin.css` | Same name but different travel/rotation/duration | One namespaced `motion/entrance.css` animation or local namespaced keyframes |
| `shimmer` keyframe | `background.css`, `landing.css` | Same name and similar line sweep, separately declared | One shared background animation if timing/easing remain appropriate |
| Carousel entry | `profile.css` (`setupSlideIn`, `profileSlideIn`) | Similar translate/fade, different distances/duration | Shared small `slide-in` motion token with direction/distance variables |
| `@media(max-width:600px)` blocks | `profile.css`, `teams.css`, `landing.css`, `dark-theme.css` | No; separate component concerns, some repeated blocks within file | Keep scoped but consolidate each file’s duplicate breakpoint sections |
| Schedule grid row variable | `theme.css`, `builder.css`, `dashboard.css`, `landing.css`, `plotter.css`, `teams.css` | No; 34–60px values serve different geometries | Rename by component (`--builder-row-height`, `--plotter-row-height`) or document intentional differences |
| Transient messages/toasts | `popup.css`, `teams.css`, `admin.css`, `auth.css` | No; modal vs toast vs inline validation | `components/feedback.css` for alert/status primitives; visual roles remain semantic |

## 7. Page-specific styles

| Page | Unique rules not covered by shared components |
|---|---|
| Landing | Animated grid canvas, particle positioning, marketing hero typography/layout, schedule-demo storytelling cards, staggered reveal and CTA section. |
| Home | Greeting/time-of-day name, schedule demo grid, draggable Builder/Plotter/Teams cards with runtime `--panel-top/--panel-hours`, keyboard/pointer placement. |
| Login | Two-part visual/form card, auth branding, sign-in/reveal password, login link states. |
| Sign up | Account verification/PIN steps, password requirements tooltip, consent and locked/processing states. |
| Forgot password | Reset email/PIN/password step visibility and validation; uses auth stylesheet but a separate flow. |
| Setup | Five-step profile onboarding, progress dots, transition direction, setup preference fields, Back/Next/final Save behavior. |
| Builder | Schedule selector, event form and weekday grouping, event cards, unsaved/unadded hints, Excel import, event-edit and Smart Schedule dialog. |
| Plotter | Schedule list selection, time-axis grid, rendered event geometry, per-block font/fill controls, overrides, export/capture view and PNG/PDF styles generated in JS. |
| Profile | Profile preferences and availability grid, multi-step carousel, user/availability fields, step save/pagination controls. |
| Teams | Team vs member timetable, selected-member slide strip, schedule proposals/conflicts, shared schedule controls, no-team onboarding dialog. |
| Team settings | Team create/update/delete actions, member-role list and permissions, team view link, empty-team state. |
| Admin | KPI and health dashboards, status chips, server/chart panels, insight views, user/audit/error tables, user data detail, admin toast and skeleton variants. |

## 8. Dead/orphaned CSS candidates

Static text matching was compared against current HTML and JS, including dynamically constructed class strings found in the frontend/admin scripts. A missing literal is not proof of dead CSS: a selector can be created by a template, a third-party embed, or a future/conditional state. “Safe” below means safe to remove only after one runtime confirmation that the related feature is absent; until then treat all as **Verify**.

| Selector(s) | Source | Evidence/status |
|---|---|---|
| `.event-details`, `.smart-schedule-eyebrow`, `.smart-schedule-hint`, `.smart-schedule-model-label` | `builder.css` | No literal match in current HTML/JS. **Verify** Builder dialogs and smart-schedule states before removal; the last three may be older model-card markup. |
| `.app-header`, `.brand-mark`, `.brand-name`, `.header-button`, `.sfv-inline` | `chrome.css` | Some older header aliases; `.sfv-inline` may be an injected/third-party footer value. **Verify** generated header/footer and external branding. |
| `.team-day-control` | `custom-dropdown.css`, `teams.css` | Appears only in CSS literal scan. **Verify** legacy Team day filter state before removal. |
| `.hero-title`, `.hero-copy`, `.hero-center`, `.hero-actions`, `.hero-btn-ghost`, `.hero-btn-primary`, `.hero-kicker`, `.hero-subtitle` | `landing.css` | No current `index.html`/JS match for these names despite extensive definitions. Likely legacy marketing design. **Verify** conditional/embedded landing variant, then remove as a group if absent. |
| `.btn-add`, `.landing-buttons`, `.page-header`, `.social` | `main.css` | No current page/JS match. Legacy auth selectors. **Verify** no alternate auth fragment is injected. |
| `.color-input-wrapper`, `.hex-text`, `.overwrite-option`, `.reset-field` | `plotter.css` | No matching class in current HTML/JS scan. **Verify** Plotter options/runtime controls; `.reset-field` may be assigned through templates. |
| `.pf-grid`, `.profile-container-two-col`, `.pf-stack`, `.profile-step-kicker` | `profile.css` | Some layout classes may be produced conditionally; `.pf-grid` has responsive rules but no current literal use. **Verify** Profile/Setup. |
| `.settings-person-actions` | `teams-settings.css` | No static HTML/JS literal match. **Verify** person-card template path before removal. |
| `.team-dialog-mark` | `team-preferences.css`, `dark-theme.css` | Theme-only class absent from current HTML/JS. **Verify** dialog markup/legacy alias; dark override alone is not evidence of a live element. |
| `.admin-chart-grid`, `.admin-lower-grid`, `.admin-skeleton-health`, `.admin-skeleton-kpis`, `.admin-skeleton-table` | `admin.css` | Some are referenced by responsive rules or may be emitted only during loading. **Verify** Admin views/loading states before removal. |
| `.sr-only` | `time-picker.css` | Not found in current HTML/JS; visually-hidden helper likely template-dependent. **Verify** generated time-picker markup; `timePicker.js` currently emits a different hidden helper pattern. |

No candidate is marked immediately Safe to delete from static inspection alone.

## 9. Inconsistencies and accessibility gaps

### Inconsistent visual values

- The repository has several Light palettes at once: plum Schedula (`#2a1245/#62298a`), slate/violet legacy (`#0f172a/#7c3aed`), profile (`#7a3fb5` accent), and auth accent (`#8b5cf6`). Load order decides which appears.
- Dark mode uses muted neutral gray/purple tokens, but several page selectors retain hard-coded Light colors and require increasingly specific `!important` corrections.
- Same conceptual raised button radius is 12px, 14px, or 10px by stylesheet. Button heights range 34–54px; standard header is 42px and team/settings controls commonly 44–46px.
- Cards/panels use radii 12–28px and distinct inset/step/drop shadows. Flat and raised panel semantics are not expressed through a common component contract.
- Green success/save colors vary: admin semantic green tokens; public Dark save `#4c9b70/#28734d`; Light save recipes elsewhere use pale green through teal. Danger/warning actions have similar independent recipes.
- Page breakpoints overlap but do not align: 1080, 1000, 900, 860, 820, 800, 720, 700, 600, 560, 520, 380, 360px. Responsive rules are often appended as repeated blocks rather than collected.
- `--row` changes between scheduling components and has collision-prone global naming. It is an intentional geometry variable but not clearly component-scoped.

### States and accessibility

- `theme.css` supplies a 3px global `:focus-visible` ring, but component rules often use `outline:none` and replace it with a bespoke ring or shadow; inspect keyboard visibility in every variant.
- Many clickable page controls have `:hover` and `:active` but no direct `:focus-visible` rule; fallback depends on the global outline and CSS specificity.
- `.key:disabled` has a disabled state; not every custom button family has matching disabled styling. ARIA-disabled and native disabled controls should be checked consistently.
- Auth color contrast and muted text depend on hard-coded palette; dark-theme generic `span`/`label` rules can override semantic text unless explicitly scoped.
- Several custom controls visually hide native inputs; maintain keyboard focus forwarding and accessible labels when consolidating. Custom dropdown/time-picker JS already sets expanded/pressed/selected state in key paths.
- Admin table mobile mode hides headers visually and relies on `data-label` pseudo content. Confirm each dynamic cell has a correct label and screen-reader table semantics remain useful.
- Time picker wheel hides scrollbars by design; keep visible focus and non-pointer selection. Plotter swatches have accessible labels and `aria-pressed`; maintain that state when changing paint.
- Motion is reduced in shared `theme.css`, `background.css`, `responsive-chrome.css`, profile/team dialogs and admin, but the coverage is distributed and inconsistent. `theme-transitioning` runs 180ms; page entrance animations range roughly 160–500ms.

## 10. Proposed consolidation (no code changes in this step)

Target structure:

```text
frontend/css/
  tokens.css                 # color, type, spacing, radius, shadow, z, motion; Light/Dark values
  base.css                   # reset, body, shell, focus-visible, typography defaults
  components/
    buttons.css
    forms.css
    surfaces.css
    dialogs.css
    feedback.css
    navigation.css
    data-display.css         # tables, badges, empty states, skeletons, scroll regions
    custom-dropdown.css
    time-picker.css
  themes/
    dark.css                 # token overrides first; small component exceptions only
  pages/
    landing.css
    auth.css
    dashboard.css
    builder.css
    plotter.css
    profile.css
    teams.css
    teams-settings.css
    admin.css
```

Recommended order on public pages: `tokens.css` → `base.css` → `background.css` → shared component files → one page stylesheet → `themes/dark.css` → `responsive-chrome.css`. Keep time picker/dropdown component styles before Dark theme. Move the admin token import to `tokens.css`; admin remains Light until an explicit admin Dark mode is designed. Auth pages should stop loading `main.css` once its surviving unique rules are moved to `auth.css`; remove duplicate root palettes only after verifying screenshots.

Migration sequence: (1) resolve canonical colors and radii, preserving named semantic values; (2) centralize focus, button, field, surface and dialog contracts; (3) move repeated rules without changing selectors or page geometry; (4) namespace schedule dimension variables; (5) reduce Dark CSS from broad `:is()`/suffix selectors and `!important` patches to tokenized component variants; (6) consolidate breakpoint blocks and keyframes; (7) verify all page/theme/state combinations and only then remove orphan candidates.

## 11. Usage rules for contributors

1. Check `tokens.css` for a semantic value before adding a literal. Add a token for a repeated role shared by multiple pages; do not create a token for a one-off geometry value unless runtime code must set it.
2. Use semantic names (`--surface-raised`, `--text-muted`, `--action-success`, `--radius-control`) rather than color names for new shared roles. Keep user-selected Plotter colors as data and inline per-block values, outside the global theme.
3. Name classes by component and role using the existing kebab-case convention (`.time-picker-trigger`, `.team-view-option`, `.admin-health-card`). Use modifier classes for variants and state classes/ARIA attributes for state; avoid styling by generated element order when a state class is available.
4. Give every interactive component default, hover, focus-visible, active, disabled, selected/open, and error/success states as applicable. Keep keyboard focus visible, reduce motion under `prefers-reduced-motion`, and use native disabled/ARIA state consistently.
5. For themed components, define the Light component contract once, then use variables for fill, foreground, border, focus and shadow. Dark theme should supply token values or a narrowly scoped component modifier; avoid broad selectors that repaint unrelated widgets.
6. Preserve accessibility semantics in markup: labels associated with fields, visible/accessible names for icon controls, `aria-expanded` for expandable controls, `aria-pressed` for toggles, live regions for async status, and table headers/labels for responsive data.
7. Keep page layout and data visualization geometry in the page stylesheet; put shared visual behavior in component styles. Document intentional differences (e.g. Plotter’s block colors and Team/Member view geometry) next to the owning component.

### Canonical markup patterns from the current pages

Raised navigation/action key:

```html
<a class="key sm" href="builder.html">Builder</a>
<button class="key sm icon" type="button" aria-label="Profile settings">…</button>
```

Labeled form control and enhanced time picker:

```html
<label class="field">
  <span>Start time</span>
  <input id="event-start" type="text" data-time-picker inputmode="numeric">
</label>
```

View toggle:

```html
<div class="team-view-switch" role="group" aria-label="Schedule view">
  <button class="team-view-option is-active" aria-pressed="true">Team View</button>
  <button class="team-view-option" aria-pressed="false">Member View</button>
</div>
```

These snippets are from [`pages/home.html`](../../../pages/home.html), [`pages/builder.html`](../../../pages/builder.html), and [`pages/teams.html`](../../../pages/teams.html), respectively. Ellipses stand for existing SVG/icon contents and are not literal replacement markup.
