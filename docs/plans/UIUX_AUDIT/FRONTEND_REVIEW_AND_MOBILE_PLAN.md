# Schedula public frontend review and mobile UI/UX plan

**Status:** Implementation underway; remaining review items are tracked in [`tools/PROGRESS.md`](../../../tools/PROGRESS.md)
**Date:** 2026-11-27  
**Scope:** Public landing page and signed-in student pages. Admin is excluded.  
**Implementation constraints:** Keep Bricolage Grotesque, the plum/lavender family, the physical key interaction, vanilla CSS/JavaScript, existing routes, and current product behavior unless a separate product decision approves a change.

## 1. Review of the supplied audit

The audit identifies the right architectural priorities: shared semantic tokens, removal of broad transitions, one controlled particle renderer, transform-based dragging, viewport-safe layouts, and mobile navigation. The design direction is coherent with Schedula's identity and avoids introducing a framework or motion dependency.

### Verified findings

- Theme persistence is currently ineffective. `frontend/scripts/theme.js` reads `schedula-theme`, sets `data-theme="light"` unconditionally, and alerts when asked to switch from light. `theme.css` has shared app tokens, `main.css` has a separate auth token set, and landing defines another set in `landing.css`.
- There is no current dark theme selector in the public styles. Dark theme should be treated as a feature project with contrast review, not a simple token flip.
- `main.css` assigns transitions to a broad list of elements. Landing controls use `transition: all`; this is wider than needed and makes future style changes harder to predict.
- There are two landing particle implementations: `frontend/scripts/background.js` and an inline loop near the end of `index.html`. The landing canvas is already authored in the HTML, while `background.js` creates a canvas only if absent. Consolidation needs to preserve this and ensure the script is actually loaded on the landing page.
- The particle renderer derives count from viewport area, samples random rectangle height on each frame, and does not pause for hidden tabs or reduced-motion preference.
- The landing shell uses `position: fixed`, `height: 100vh`, and `overflow: hidden`; this conflicts with content growth and short mobile viewports.
- `100vh` is still used in auth shells, shared chrome, and team panels. The supplied `100dvh` direction is appropriate, with fallbacks where needed.
- `team-status` uses `z-index: 99999`. A documented layer scale will make stacking manageable.
- The duplicated raised key treatment is visible across theme/chrome/page styles. Consolidating shared treatment should reduce drift, while page-specific spacing and layout stay local.
- The desktop signed-in header has four primary links plus account/actions. A compact mobile navigation pattern is needed; allowing a wrapped desktop nav is not a reliable mobile design.
- Logo images on signed-in pages often have empty alt text and `aria-hidden="true"` alongside visible brand text or an accessible parent label. This is usually intentional decorative treatment, so do not blindly replace every empty alt. Audit page-level accessible names and add a skip link where absent.

### Corrections and qualifications to the supplied audit

- The landing page already has a description meta tag. `pages/home.html`, `pages/teams.html`, and `pages/teams-settings.html` also include descriptions. The gap is page-specific metadata coverage, not a blanket absence.
- The audit says landing navigation should collapse below 768px, but the landing header only has theme, login, and signup actions. The four-link collapse applies to the signed-in application header. Give landing a separate compact treatment.
- The phrase “landing should call that script” needs a concrete integration decision: `background.js` currently also adds app background classes/lines and logout handling. Either make its responsibilities safe on landing and load it there, or extract a particle-only initializer. Avoid duplicating whole-page background setup.
- Dark-mode acceptance should include focus, disabled, validation, dialog, chart/block, and browser-native form-control states. Body text AA alone is not enough for a usable theme.
- The inline loop is not merely a duplicate visual effect: it owns landing-specific canvas drawing. Before deleting it, confirm the shared renderer supports the landing canvas and its lifecycle.
- `teamDialogs.js` had no HTML, runtime, import, or test references and was removed during the consistency audit.
- Review the “no hover open/close animation” recommendation against actual control behavior and keyboard focus. Desktop hover affordances should remain, but be gated to hover-capable fine pointers; touch should use explicit active/focus feedback.
- Keep the requested work focused on public/student frontend pages. Admin stays out of scope, including its stylesheet and theme.

## 2. Product and design principles

1. **Protect the existing identity.** Keep Bricolage Grotesque, deep plum text, purple action emphasis, lavender support surfaces, and the raised-key press. Reduce excessive gradients/shadows only where hierarchy or readability improves.
2. **Design mobile around tasks.** Primary tasks are opening the weekly plan, adding or editing a block, checking a conflict, switching schedule, comparing team availability, and exporting a view.
3. **Use progressive disclosure.** Keep the schedule and next action prominent. Put infrequent controls in a sheet or secondary panel rather than compressing every desktop control into a small viewport.
4. **Keep content in normal document flow.** The landing page and application pages should scroll when content exceeds the viewport. Use fixed positioning only for intentionally persistent controls, with safe-area padding.
5. **Make every touch action dependable.** Aim for 44 by 44 CSS pixel targets, clear pressed/focus states, and no hover-only behavior. Prevent gesture conflicts between page scrolling, horizontal calendar navigation, and block dragging.
6. **Preserve accessible operation.** Keyboard navigation, visible focus, labels, status announcements, reduced motion, contrast, and zoom/reflow are release criteria.
7. **Make motion quality a release goal.** Use purposeful, coherent animation to clarify state changes and add character to occasional moments. Frequent scheduling actions stay immediate; motion must be interruptible, use transform/opacity where possible, and respect reduced-motion preferences.

## 3. Mobile information architecture

### Signed-in navigation

- At wide desktop widths, retain the current header navigation.
- At widths below the verified header-fit breakpoint (start evaluation at 768px), replace the row of four keys with a compact mobile navigation. Preferred plan: a fixed bottom bar for **Home**, **Builder**, **Plotter**, and **Teams**, with the active destination clearly named and marked. Keep Profile, theme, and logout in a top account control or profile screen; do not squeeze them into the bottom bar.
- Respect `env(safe-area-inset-bottom)` and keep the bar from obscuring page actions or dialogs. Main content receives matching bottom clearance.
- The compact header retains the Schedula wordmark or a short brand mark, page context where useful, and an account/profile entry point. Do not turn it into a two-row wrapped desktop header.
- Confirm whether the current user expects a persistent bottom bar during long forms. If it competes with keyboard entry, hide or inset it while a text field is focused.

### Landing page

- On phones, use a normal scrolling page: header, concise value proposition and primary actions, then the interactive schedule demonstration, then remaining supporting content/footer.
- Keep signup as the primary action and login as the secondary action. Do not make the hero require a full viewport height.
- Reduce decorative line/particle density on small screens; skip particles under reduced motion and avoid obscuring text or schedule blocks.
- Make the demo usable without drag: retain Move/Reset controls and offer keyboard-accessible block selection/movement. Use touch drag only as an enhancement.

## 4. Page-by-page mobile behavior

### Home (`pages/home.html`)

- Stack the greeting/primary links above the live schedule preview. Keep Builder and Plotter reachable without scrolling far; Teams remains a clear secondary action.
- At narrow widths, convert the week preview into a day-focused view with a day selector/swipe affordance and a visible “Day N of 7” label. Do not shrink seven columns until event text becomes illegible.
- Keep current keyboard block movement available; provide accessible controls for moving a block when touch dragging is not practical.
- Show empty/loading/error states in the schedule region without collapsing the page layout.

### Builder (`pages/builder.html`)

- Put schedule selection and the current schedule name at the top. Keep a persistent but non-obstructive Add block action available after the user scrolls.
- Present the event form in a full-height or near-full-height bottom sheet on phones, with a clear title, close/cancel action, save action reachable above the keyboard, and scrollable form body. On wider screens retain the current two-column layout where it fits.
- Stack fields in task order: title, day/date, start/end, modality/location, description. Use native date/time controls where current behavior supports them; preserve current validation and field IDs/contracts.
- Keep schedule visualization legible by switching to a selected-day timeline or horizontally paged day lanes instead of forcing unreadable seven-column content. Label any horizontal scroller and show a partial next day or explicit day controls.
- Block editing must have an explicit tap target and accessible non-drag alternatives (time/day controls or nudge buttons). Drag handles must be distinct from scrolling gestures; test touch-action behavior carefully.
- Keep conflict messages adjacent to the changed fields/block and announce updates through an appropriate live region. Do not rely on color alone.
- Convert import/large data views to a responsive list/row card pattern where columns would overflow, while retaining all information and actions.

### Plotter (`pages/plotter.html`)

- Prioritize the visualized schedule. Put schedule selection and export/share actions in a compact top control row.
- Move secondary options into a bottom sheet or disclosure panel; retain the existing tab semantics only if they remain understandable and operable on mobile.
- Make day navigation explicit. If the plotted schedule needs horizontal panning, use a labeled, keyboard-scrollable region with clear day labels and sufficient block width. Avoid page-wide horizontal overflow.
- Keep block details readable at phone widths: expose title/time by default where possible and use tap-to-inspect details for dense blocks. Ensure the detail does not cover the only navigation/action controls.
- Exported image dimensions and desktop visual output remain unchanged unless separately specified; responsive preview must not silently crop exported content.

### Teams (`pages/teams.html` and `pages/teams-settings.html`)

- Keep team identity, selected date/range, and the main compare/propose action at the top. Collapse secondary filters into a sheet/disclosure.
- For availability comparison, show a day at a time on narrow screens with previous/next day controls and a clear member legend. Offer an accessible list/table alternative that conveys free/busy intervals without relying on colors.
- Convert member and proposal rows to stacked cards with action menus that remain reachable and do not collide with the bottom navigation.
- Dialogs become phone-sized sheets with bounded internal scrolling, visible close controls, and safe-area-aware action rows. Verify nested dialog scroll and keyboard behavior.
- Keep settings forms single-column below tablet width; preserve labels, helper text, and validation messages.

### Profile/setup (`pages/profile.html`, `pages/setup.html`)

- Preserve the existing step sequence but use a single-column flow, explicit progress text, and previous/next actions with large targets.
- Keep the current profile carousel accessible: support swipe as an enhancement, but provide visible next/back buttons and keyboard controls; do not trap focus in off-screen steps.
- Ensure preference calendars and day/time grids reflow at 320 CSS pixels and remain understandable to screen readers.
- Keep save/cancel feedback close to the action and announce successful updates.

### Authentication (`login`, `signup`, `forgot-password`)

- Use the shared public token system and consistent key/button, focus, and field treatment. Keep login/signup layout compact and single-column on mobile.
- Keep form controls visible when the virtual keyboard opens; allow normal scrolling and avoid fixed-height card shells.
- Preserve password visibility controls, validation, and current route behavior. Provide clear error and success messages without browser alerts.

## 5. Responsive layout and interaction rules

- Evaluate widths at **320, 360, 390, 768, 1024, and 1280 CSS px**, plus short phone heights and landscape. Use content-driven breakpoints; 768px is a starting point for navigation review, not a fixed requirement for every component.
- Use fluid containers with consistent side gutters (16px phone baseline, expanding at tablet/desktop), `min-width: 0` in grid/flex children, and safe-area insets for fixed elements.
- Prefer `min-height: 100dvh` for viewport shells, with an intentional fallback. Do not impose viewport height on content pages.
- Avoid page-level horizontal scrolling. Calendar/plotter regions may scroll horizontally only when clearly bounded, labeled, and operable by touch and keyboard.
- Use 44px minimum interactive target height/width as the default; tighter icon buttons need adequate hit-area padding.
- Gate hover elevation under `(hover: hover) and (pointer: fine)`. Keep touch `:active`, keyboard `:focus-visible`, and disabled states distinct.
- Set a small documented layer scale for header, popover, dialog, and toast. Use modal/sheet focus management and verify stacking against fixed navigation.
- Preserve data/content at 200% zoom and text resizing; no clipping of form errors, names, labels, or key actions.

## 6. Shared visual system and motion work

Motion quality is a first-class product goal alongside responsive layout and theme consistency. Use the physical key press for frequent action feedback, crisp transitions for hover/focus, and more expressive but brief movement for occasional dialogs and the landing demonstration. Avoid animating routine navigation, keyboard-driven schedule edits, or repeated list updates. Each animation should explain location, state, or response; keep enter/exit behavior cohesive and make reduced motion a supported presentation mode.

### Tokens and components

- Inventory public CSS values and computed styles before moving declarations. Establish semantic tokens for page/surface/text/muted/border/accent/raised-key face/edge/shadow/focus/overlay/particle colors, plus spacing, radii, layer levels, and motion durations.
- Keep light values visually equivalent during token migration. Fold duplicated auth tokens into the shared theme only after checking computed styles on every auth route.
- Keep the raised key's inset highlight, colored lower edge, and translate-on-press. Centralize its shared face and state rules; leave dimensions/placement to page components.
- Convert hard-coded SVG strokes to `currentColor` where their meaning is foreground color.
- Add dark theme only after the public surfaces use semantic tokens. Support persisted binary Light/Dark choice and no-flash initialization. Use a muted charcoal/graphite base with restrained gray-lavender accents, then check actual contrast and brand recognition.

### Motion/performance

- Replace universal and `all` transitions with short property lists. Keep routine press response fast; reserve longer transitions for occasional overlays and landing-only introduction.
- Use transform for pointer movement during drag, then commit layout position once on release. Avoid permanent `will-change` declarations.
- Consolidate particle rendering into one bounded loop with fixed particle geometry, cached theme color, a hidden-document pause, and a reduced-motion bypass. Confirm resize and teardown behavior and that app background setup is not duplicated.
- Apply reduced-motion behavior consistently across landing, auth, app, dialogs, and canvas. Preserve short opacity/color feedback only where useful.
- Use interruptible dialog/menu/toast state transitions and honor focus/escape/close behavior. Do not animate frequent schedule updates or routine navigation.

## 7. Recommended delivery sequence

| Phase | Work | Exit criteria |
|---|---|---|
| 0. Baseline and decisions | Confirm public route list, stylesheet/script ownership, current mobile breakpoints, and mobile calendar representation. Record baseline screenshots at 390px and 1280px for each in-scope page. | A page/state inventory exists; baseline captures and known behavior are documented. No code changed in this plan phase. |
| 1. Responsive shell | Make landing scroll; use viewport-safe shells; define compact app navigation, safe-area spacing, and page gutters. | No header wrap or page-wide horizontal overflow at 320–390px; primary navigation/action remains reachable. |
| 2. High-use app workflows | Implement Home, Builder, and Plotter mobile layouts and non-drag alternatives. | Add/edit/move/inspect schedule blocks and navigate the week using touch, keyboard, and screen reader friendly controls. |
| 3. Teams and account flows | Adapt team comparison/settings, profile/setup, and auth forms and dialogs. | Main workflows fit mobile, sheets behave with virtual keyboards, and availability has a non-color-only representation. |
| 4. Shared tokens and motion | Consolidate public tokens/key style, narrow transitions, unify reduced-motion behavior and particle loop, and tune the motion language across keys, overlays, dropdowns, and the landing demo. | Light mode remains visually stable; no duplicated particle animation; transitions feel consistent and purposeful; reduced-motion stops decorative motion. |
| 5. Dark theme | Add semantic dark values, three-way preference behavior, and page-by-page tuning. | All in-scope screens/states render in both themes; contrast/focus/forms/dialogs verified; stored and system behavior works. |
| 6. Accessibility and polish | Correct page metadata gaps, skip links, focus order, touch targets, accessible names, stacking, and final responsive details. | Acceptance checklist below passes at supported widths, zoom, keyboard, touch, and reduced motion. |

Order within the supplied technical roadmap should be adjusted so the mobile shell and task flows are designed before detailed theme rollout. Token extraction can begin early, but the dark theme should not block usable mobile improvements.

## 8. Acceptance checklist for implementation

### Layout and behavior

- Landing scrolls naturally on short phones and the demo remains operable.
- Signed-in navigation does not wrap; active location is apparent and the bottom bar does not cover content, dialogs, or form actions.
- No page-wide horizontal overflow at 320px; intentionally scrollable schedule regions are bounded and labeled.
- Builder supports adding, editing, moving, and conflict-checking blocks without requiring a drag gesture.
- Plotter controls remain discoverable and export is not cropped by the responsive preview.
- Teams availability remains interpretable without color and without requiring a seven-column phone grid.
- Forms and dialogs remain usable with the mobile keyboard open, at landscape height, and with safe-area insets.

### Accessibility and motion

- Skip link, page title, landmark structure, accessible names, labels, focus visibility, and logical focus order are present on every public route.
- All actions work by keyboard; interactive target sizes are adequate; focus is not hidden behind fixed chrome.
- At 200% zoom and 320px width, content reflows without loss of information or controls.
- Reduced-motion preference pauses particles and suppresses nonessential movement consistently.
- Light and dark colors meet WCAG AA for text and controls/states; focus and error states are not conveyed by color alone.

### Visual consistency

- Bricolage Grotesque, plum/lavender accents, and the physical key remain recognizable across landing, auth, and signed-in pages.
- Shared keys and common surfaces use the same tokens; page-specific layouts remain understandable and maintainable.
- No unintended layout/color/shadow transitions occur when opening menus, forms, or schedule panels.
- Frequent schedule actions respond immediately; occasional overlays have clear, interruptible enter/exit motion; the landing demo uses a brief one-time entrance sequence.
- Motion uses a consistent easing/duration vocabulary and does not cause layout work on every drag frame.

## 9. Remaining validation after implementation

- [x] Search the repository for `frontend/scripts/teamDialogs.js`; no runtime, import, or test references existed, so remove the dead file.
- Confirm whether `background.js` is intended to be loaded on the landing page; if so, isolate particle setup from app-only decorations/logout behavior or guard each responsibility explicitly.
- Confirm actual drag code and browser behavior before selecting pointer capture/touch-action rules for Home and Builder.
- Confirm supported mobile browser/device range and whether a PWA/offline requirement exists; this plan assumes a responsive web app, not a native app or PWA project.
- [x] Use the requested binary Light/Dark theme setting; Light is the default and the selected mode persists.
- [ ] Complete visual page-state review for consistent page backgrounds, shared navigation, and control dimensions across desktop/mobile and both themes.

