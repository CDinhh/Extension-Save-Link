# Popup Glass Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Save Link popup to the approved "E transparent glass" look with Phosphor Light icons and Be Vietnam Pro, add a settings popover (theme, language, transparency, blur), translate the UI (vi/en), and make drag and drop work in the real popup.

**Architecture:** Plain MV3 extension, no build step. New small scripts (`i18n.js`, `settings.js`, `settings-boot.js`) are shared by the popup and, for `i18n.js`, the service worker via `importScripts`. Icons come from one local SVG sprite referenced with `<use>`. Behaviour is verified by an end-to-end script that drives Edge over the CDP pipe and loads the repo as an unpacked extension.

**Tech Stack:** Vanilla JS, CSS, Sortable.js (already vendored), Node 24 (test runner only), Python 3 (packaging), Microsoft Edge (tests), agent-desktop (real-mouse check on Brave).

**Spec:** `specs/2026-11-06-popup-glass-redesign-design.md`

## Global Constraints

- Manifest V3, `minimum_chrome_version` stays `114`; no new permissions; nothing loaded from the network at runtime.
- Storage keys unchanged: `savedLinksData`, `categoriesOrder`, `dataLastModified`, `syncState`, `googleUser`. New key: `uiSettings = { theme, lang, transparency, blur }` in `chrome.storage.local`, never synced or written to the sheet.
- Defaults: `theme: 'light'`, `transparency: 32` (0–100), `blur: 2` (px, 0–24), `lang`: `'vi'` if `navigator.language` starts with `vi`, else `'en'`.
- No gradient blobs, mesh gradients or blurred colour orbs. Colour comes only from category colours.
- Background: flat `#eef0f7` (light) / `#0a0b13` (dark) with a dot grid, dot ~1.3px, grid 16px, dot colour `rgb(21 23 43 / 22%)` / `rgb(255 255 255 / 16%)`.
- Card glass: fill opacity = `1 - transparency/100`; `backdrop-filter: blur(<blur>px) saturate(160%)`, omitted entirely when blur is 0. Bars, menus and dialogs: fixed blur ~14px, 45% fill.
- Motion easing `cubic-bezier(.32, .72, 0, 1)`; animate `transform`/`opacity` only (category expand may keep its grid-rows transition); honour `prefers-reduced-motion`.
- Popup size 420x580. Font Be Vietnam Pro 400/500/600/700, latin + vietnamese subsets, bundled. Icons Phosphor Light, bundled, MIT licence file included.
- Drag: Sortable `forceFallback: true`, whole row / whole category header draggable, no drag from buttons, checkbox, colour input or edit inputs; disabled while searching.
- Downloads (font and icon files) require the owner's approval first: state file names, source and size.
- No commits or pushes unless the owner asks (owner's global rule); work stays on branch `store-prep`.
- Existing behaviour must survive: dialogs instead of alert/confirm/prompt, Undo on link delete, search auto-expands, Esc clears search, + prefills current page, account menu, import/export, scroll position kept, HTML escaping.

## Review Focus

- Stored `uiSettings` corrupted or out of range (`transparency: 500`, `blur: 'x'`, unknown `lang`): expect clamped or default values, never a broken page. Test in Task 3.
- Switching language with the popup open: every visible string, placeholder and aria-label changes, and the right-click menu is rebuilt in the new language. Tests in Tasks 2 and 3.
- A click with a tiny mouse wobble on a link still opens it rather than starting a drag; pressing on the checkbox or a button never starts a drag. Test in Task 5.
- Long category names, long URLs and Vietnamese diacritics at 420px: ellipsis, no horizontal scroll, no clipped accents. Test in Task 4.
- About 150 links with blur on: render stays fast and blur 0 removes `backdrop-filter`. Test in Task 4.

---

### Task 1: End-to-end test harness in the repo

**Files:**
- Create: `tests/cdp.mjs`, `tests/popup.e2e.mjs`
- Modify: `README.md` (one line on running tests)

**Interfaces:**
- Produces: `launch(browserPath, profileDir) -> { send, attach, evaluate, close, errors }` (CDP over `--remote-debugging-pipe` with `--enable-unsafe-extension-debugging`), ported from the session's scratch `cdp.mjs`.
- Produces: `tests/popup.e2e.mjs` that loads the repo root with `Extensions.loadUnpacked`, opens `popup.html` in a 420x580 tab, and exposes helpers `js, click, setValue, key, text, count, storage, setStorage, reload, check(name, ok, detail)`; exits with code 1 if any check fails. Browser path from env `BROWSER_PATH`, default `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`. Temporary profile under `os.tmpdir()`, deleted at exit.

- [ ] **Step 1:** Port the 47 checks from the session's scratch `test_ui.mjs` into `tests/popup.e2e.mjs`, grouped in named sections (`firstRun`, `categories`, `links`, `undo`, `reorder`, `search`, `scroll`, `dialogs`, `import`, `hostile`, `account`). Selectors that later tasks keep stable: `.category`, `.category-header`, `.category-name`, `.link-item`, `.link-main`, `.link-title`, `.link-url`, `.link-checkbox`, `.add-link-btn`, `.edit-link`, `.copy-link`, `.delete-link`, `.edit-category`, `.delete-category`, `#appDialog`, `.toast`, `#searchInput`, `#addCategoryBtn`, `#linksList`. The theme checks move to Task 3.
- [ ] **Step 2:** Run `node tests/popup.e2e.mjs`. Expected: `ALL PASSED` against the current code.

### Task 2: i18n dictionary for the popup and the context menu

**Files:**
- Create: `i18n.js`
- Modify: `background.js` (menu titles, notifications, `importScripts`), `popup.html` (`data-i18n` attributes), `popup.js` (all user-visible strings via `t()`)
- Test: `tests/popup.e2e.mjs` (section `i18n`)

**Interfaces:**
- Produces (global functions, work in a page and in the service worker):
  - `STRINGS: { en: Record<string,string>, vi: Record<string,string> }`, same keys in both.
  - `defaultLang(): 'vi' | 'en'` from `navigator.language`.
  - `setLang(lang: string): void`. Unknown values fall back to `defaultLang()`.
  - `getLang(): 'vi' | 'en'`.
  - `t(key: string, vars?: Record<string,string|number>): string` replaces `{name}` placeholders. A missing key returns the English text, then the key itself.
  - `applyI18n(root: ParentNode): void` fills `textContent` from `data-i18n`, and `placeholder`, `title` and `aria-label` from `data-i18n-placeholder`, `data-i18n-title` and `data-i18n-aria`.
- Consumes in background: `chrome.storage.local.get('uiSettings')` to call `setLang` before building the menu.

- [ ] **Step 1: Write the failing test** `i18n` section:
  - Set `uiSettings.lang = 'vi'`, reload. Assert `#searchInput.placeholder === 'Tìm link'`, `#addCategoryBtn` text contains `Nhóm mới`, and footer text contains `Xuất` and `Nhập`.
  - Set `lang = 'en'`. Assert `'Search links'` and `'New category'`.
  - Evaluate in the page: `Object.keys(STRINGS.en).sort().join() === Object.keys(STRINGS.vi).sort().join()`.
  - Evaluate `t('deleteCategoryTitle', { name: '<b>' })`. It must contain the literal `<b>`, because the output is only ever used through `textContent`.
- [ ] **Step 2:** Run it. Expected: FAIL, `STRINGS is not defined`.
- [ ] **Step 3:** Implement `i18n.js` and move every hard-coded string from `popup.html`, `popup.js` and `background.js` into it. Vietnamese copy is short and natural. The labels used in the mockups are fixed: `Tìm link`, `Nhóm mới`, `Xuất`, `Nhập`, `Đăng nhập`. In `background.js`, add `i18n.js` to `importScripts`, read `uiSettings` before `updateContextMenu()`, and call `scheduleContextMenuUpdate()` when `changes.uiSettings` arrives in `storage.onChanged`.
- [ ] **Step 4: Add a background check** to the same section:
  - Attach to the service worker target.
  - Set `uiSettings.lang = 'vi'`, wait 500ms, then evaluate `chrome.contextMenus` titles. Chrome has no getter, so expose `globalThis.__menuTitles` in `background.js`, filled inside `updateContextMenu()`.
  - Assert `__menuTitles` includes the Vietnamese text for "Save page to...".
- [ ] **Step 5:** Run `node tests/popup.e2e.mjs`. Expected: `ALL PASSED`.

### Task 3: Settings model, boot script and settings popover

**Files:**
- Create: `settings.js`, `settings-boot.js`
- Delete: `theme.js` (replaced by `settings-boot.js`)
- Modify: `popup.html` (gear button, `#settingsPanel` popover, script tags), `popup.js` (wire controls), `popup.css` (panel styles)
- Test: `tests/popup.e2e.mjs` (section `settings`)

**Interfaces:**
- Produces in `settings.js`:
  - `DEFAULT_SETTINGS = { theme: 'light', transparency: 32, blur: 2 }`. `lang` is filled by `defaultLang()`.
  - `normalizeSettings(raw: unknown) -> { theme: 'light'|'dark', lang: 'vi'|'en', transparency: number, blur: number }`:
    - `transparency` is clamped to 0–100 and `blur` to 0–24, both rounded.
    - A non-number becomes the default.
  - `applySettings(s): void`:
    - Sets `document.documentElement.dataset.theme` and `lang`.
    - Sets the CSS vars `--fill` (`1 - transparency/100`) and `--blur` (`blur + 'px'`).
    - Sets `data-glass="off"` on `<html>` when blur is 0.
    - Calls `setLang` and `applyI18n(document)`.
    - Mirrors to `localStorage['uiSettings']` inside try/catch.
  - `loadSettings(): Promise<s>` reads storage, then normalizes.
  - `saveSettings(patch): Promise<s>` merges, normalizes, writes storage, applies.
- Produces in `settings-boot.js` (loaded in `<head>`, synchronous): reads `localStorage['uiSettings']` in try/catch and sets `data-theme`, `--fill`, `--blur` before first paint.
- Consumes: `setLang`, `applyI18n` from Task 2.
- Gear button `#settingsBtn` with `popovertarget="settingsPanel"`. The panel contains:
  - `#themeLight`, `#themeDark`: segmented control.
  - `#langVi`, `#langEn`.
  - `#transparencyRange` (0–100) and `#blurRange` (0–24), each followed by an `output` showing the value.
  - `#settingsReset`.
  - Range `input` events apply live. Saving is debounced about 150ms.

- [ ] **Step 1: Write the failing test** `settings` section:
  - The default page has no `data-theme`, and body background is `rgb(238, 240, 247)`.
  - Clicking `#themeDark` gives background `rgb(10, 11, 19)`. After reload it is still dark, with no light frame in between: assert `data-theme === 'dark'` before `DOMContentLoaded`, using a `Page.addScriptToEvaluateOnNewDocument` probe.
  - Setting `#transparencyRange` to 32 and `#blurRange` to 2 gives `--fill` `0.68` and `--blur` `2px`, and the first `.category` computed `backdrop-filter` contains `blur(2px)`.
  - Setting blur to 0 makes the computed `backdrop-filter` `none`.
  - Storing `uiSettings = { transparency: 500, blur: 'x', lang: 'fr', theme: 'pink' }` and reloading gives slider values `100` and `2`, lang `defaultLang()`, and theme light.
  - `#settingsReset` restores 32 and 2.
  - Switching `#langVi` updates the gear button's `aria-label` without a reload.
- [ ] **Step 2:** Run it. Expected: FAIL, `#settingsBtn` not found.
- [ ] **Step 3:** Implement `settings.js`, `settings-boot.js` and the panel. Remove the old theme toggle button and `theme.js`.
- [ ] **Step 4:** Run `node tests/popup.e2e.mjs`. Expected: `ALL PASSED`.

### Task 4: Bundled font and icons, and the glass visual redesign

**Files:**
- Create: `fonts/be-vietnam-pro-{latin,vietnamese}-{400,500,600,700}-normal.woff2`, `fonts/OFL.txt`, `icons/phosphor-light.svg` (sprite), `icons/PHOSPHOR-LICENSE.txt`
- Modify: `popup.html`, `popup.css` (full restyle), `popup.js` (markup templates use `icon(name)`), `scripts/package-store.py` (FILES list), `manifest.json` only if a file needs listing (none expected)
- Test: `tests/popup.e2e.mjs` (section `visual`)

**Interfaces:**
- Produces in `popup.js`: `icon(name: string, extraClass?: string): string` returns `<svg class="icon ${extraClass}" aria-hidden="true"><use href="icons/phosphor-light.svg#${name}"></use></svg>`. The names are the Phosphor ids below.
- Sprite symbol ids, one `<symbol id="...">` per icon: `magnifying-glass, plus, gear-six, arrows-clockwise, caret-right, pencil-simple, copy, check, trash, table, sign-out, export, download-simple, google-logo, x, moon, sun, link-simple`.

- [ ] **Step 1: Ask the owner before downloading.** The download list:
  - Fonts: 8 files, `@fontsource/be-vietnam-pro@5` from jsDelivr, about 15 KB each.
  - Font licence: OFL.txt.
  - Icons: the 18 Phosphor `*-light.svg` files plus its LICENSE, from `@phosphor-icons/core@2` on jsDelivr, about 1 KB each.
  Save the downloads into a new empty scratch folder, then build the sprite with a one-off script kept out of the repo.
- [ ] **Step 2: Write the failing test** `visual` section:
  - `document.fonts.check('600 14px "Be Vietnam Pro"')` is true.
  - No element has a class starting with `fa-`.
  - Every `svg.icon use` resolves: its `href` symbol id exists in the fetched sprite.
  - Light body background is `rgb(238, 240, 247)` with a `radial-gradient` background-image (the dot grid). No element's computed `background-image` contains `linear-gradient`.
  - The `.bar-top` and `.bar-foot` computed `position` is `absolute` or `sticky`, and the computed `backdrop-filter` contains `blur(`.
  - Each open `.category .category-links` has a `::before` (the chain line) with non-zero height.
  - The list has 150 links under a category named with 120 Vietnamese characters, and a URL of 300 characters:
    - `#linksList.scrollWidth <= clientWidth`.
    - The title's computed `text-overflow` is `ellipsis`.
    - `renderLinks()` duration is under 120ms, measured with `performance.now()` around the call.
  - Set blur 0. Every `.category` computed `backdrop-filter` is `none`.
- [ ] **Step 3:** Run it. Expected: FAIL on the font and `fa-` checks.
- [ ] **Step 4: Implement the restyle** to match the approved mockup E (transparent), using the values in Global Constraints:
  - Header and footer are glass bars overlaid on the scrolling list. The list gets top and bottom padding equal to the bar heights.
  - Each category has a hollow ring in its colour.
  - The chain line and nodes on open categories use the category colour.
  - Search is a pill. "New category" is a dark pill with the + inside its own circle, rotating 90° on hover.
  - The avatar and sign-in pill keep their ids, `#signInBtn`, `#userInfo` and `#accountMenu`.
  - Remove the Font Awesome `<link>`, and drop `vendor/fontawesome/**` from `scripts/package-store.py` FILES.
  - Add the font files, the sprite, the licences, `i18n.js`, `settings.js` and `settings-boot.js` to FILES.
- [ ] **Step 5:** Run `node tests/popup.e2e.mjs`. Expected: `ALL PASSED`.
- [ ] **Step 6:** Run `python scripts/package-store.py`. Expected: the zip builds, and the allowlist check passes with no `missing` assertion.

### Task 5: Drag and drop with pointer fallback

**Files:**
- Modify: `popup.js` (`initializeSortable`, new auto-expand helper), `popup.css` (drag states)
- Test: `tests/popup.e2e.mjs` (section `drag`)

**Interfaces:**
- Sortable options for both lists:
  - `forceFallback: true`, `fallbackTolerance: 4`, `animation: 200`.
  - `easing: 'cubic-bezier(.32, .72, 0, 1)'`.
  - `filter: 'button, input, .category-add-form, .category-editor, .link-editor'`, `preventOnFilter: false`.
  - No `handle`, so the whole header or row is draggable.
  - Classes: `ghostClass: 'drag-placeholder'`, `fallbackClass: 'drag-lifted'`, `chosenClass: 'drag-chosen'`.
- Produces: `expandOnHover(categoryDiv: HTMLElement): void`. While a link is being dragged, hovering a collapsed `.category` header for 500ms calls `toggleCategory` on it. Cancel the timer on leave or drop.
- `.drag-lifted` is rotated 1.5° with a soft shadow. Only `transform`/`opacity` animate.

- [ ] **Step 1: Write the failing test** `drag` section. Use CDP `Input.dispatchMouseEvent` with 12 intermediate moves, as in the session's `test_drag.mjs`:
  - Dragging category A's header (not a handle) below C gives `categoriesOrder` `B,C,A`.
  - Dragging link `one` below `three` inside A gives `two,three,one`.
  - Dragging link `two` onto the header of collapsed category B and holding 600ms before release moves it to B, and B is expanded.
  - A press-and-release on `.link-main` with a 2px wobble opens a tab (the target count increases) and leaves the order unchanged.
  - Pressing on `.link-checkbox` and moving 40px leaves the order unchanged, and toggles nothing beyond the click.
  - While `#searchInput` has text, dragging leaves the order unchanged.
- [ ] **Step 2:** Run it. Expected: FAIL on the header-drag check, because the current code needs the handle.
- [ ] **Step 3:** Implement the Sortable options and `expandOnHover`. Remove the `.drag-handle` and `.drag-handle-link` markup.
- [ ] **Step 4:** Run `node tests/popup.e2e.mjs`. Expected: `ALL PASSED`.
- [ ] **Step 5: Real mouse on the owner's Brave.** The owner allowed physical input.
  - Reload the unpacked extension in Brave and open the popup.
  - Read and follow `agent-desktop skills get desktop` and `skills get platform` first.
  - Use `agent-desktop --headed` `drag` from a category header to below another category, then from a link to another category.
  - Verify the new order in the popup with a fresh snapshot.
  - If the popup cannot be driven, ask the owner to try it and report.

### Task 6: Store material and policy text

**Files:**
- Modify: `store/listing.md`, `docs/privacy.html`, `docs/vi/privacy.html`, `README.md` (project structure lines for new files)
- Regenerate: `store/screenshot-1.jpg`, `store/screenshot-2.jpg`, `store/promo-small.jpg` (from the session's `make_assets.mjs`, with popup size 420x580 and Vietnamese or English as the owner prefers; default English for the store)

- [ ] **Step 1:** In `store/listing.md`, add the following to Features: "Light and dark themes, adjustable glass transparency, Vietnamese and English".
- [ ] **Step 2:** In both privacy pages, in the data table, add a row "Display settings: theme, language, transparency and blur, kept in your browser only". The Vietnamese page gets the equivalent text.
- [ ] **Step 3:** Regenerate the store images from the packaged zip, view them, and confirm they are 1280x800 and 440x280 JPEGs.
- [ ] **Step 4:** Run `node tests/popup.e2e.mjs` and `python scripts/package-store.py` one last time. Expected: `ALL PASSED`, and the zip lists no `vendor/fontawesome` files.
