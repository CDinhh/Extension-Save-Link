// End-to-end checks of the popup. Loads the repo as an unpacked extension in a throwaway Edge profile.
// Run all: node tests/popup.e2e.mjs        Run some: node tests/popup.e2e.mjs drag settings
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const BROWSER = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const WIDTH = 420;
const HEIGHT = 580;
const profile = mkdtempSync(join(tmpdir(), 'savelink-e2e-'));
const only = process.argv.slice(2);

const cdp = await launch(BROWSER, profile);
await sleep(2500);
const { id: extId } = await cdp.send('Extensions.loadUnpacked', { path: ROOT });
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const page = await cdp.attach(targetId);
for (const domain of ['Page', 'Runtime', 'Log', 'DOM']) await cdp.send(`${domain}.enable`, {}, page);
await cdp.send('Page.bringToFront', {}, page);
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, page);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false }, page);

// ---------- helpers ----------
const POPUP = `chrome-extension://${extId}/popup.html`;
const q = JSON.stringify;
const js = (code) => cdp.evaluate(page, code);
const wait = (ms = 250) => sleep(ms);
const storage = () => js(`chrome.storage.local.get(null)`);
const setStorage = (value) => js(`chrome.storage.local.clear().then(() => chrome.storage.local.set(${q(value)}))`);
const reload = async () => { await cdp.send('Page.navigate', { url: POPUP }, page); await sleep(1100); };
const setValue = (sel, value) => js(`(() => { const el = document.querySelector(${q(sel)}); el.value = ${q(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const key = (sel, name) => js(`document.querySelector(${q(sel)}).dispatchEvent(new KeyboardEvent('keydown', { key: ${q(name)}, bubbles: true, cancelable: true }))`);
const click = (sel) => js(`document.querySelector(${q(sel)}).click()`);
const text = (sel) => js(`document.querySelector(${q(sel)})?.textContent?.trim() ?? null`);
const count = (sel) => js(`document.querySelectorAll(${q(sel)}).length`);
const dialogOpen = () => js(`document.getElementById('appDialog').open`);
const box = (sel, i = 0) => js(`(() => { const r = document.querySelectorAll(${q(sel)})[${i}].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }, page);
async function drag(from, to, { hold = 250, steps = 12 } = {}) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y, button: 'none' }, page);
    await sleep(100);
    await mouse('mousePressed', from.x, from.y);
    await sleep(120);
    for (let i = 1; i <= steps; i++) {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps, button: 'left', buttons: 1 }, page);
        await sleep(40);
    }
    await sleep(hold);
    await mouse('mouseReleased', to.x, to.y);
    await sleep(500);
}
const link = (name, extra = {}) => ({ url: `https://${name}.test`, description: name, done: false, timestamp: 1, ...extra });
const linkNames = async (cat) => (await storage()).savedLinksData[cat].links.map((l) => l.description).join();

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
    ok ? passed++ : failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ` -> ${JSON.stringify(detail)}` : ''}`);
};

const SECTIONS = {};
const section = (name, fn) => { SECTIONS[name] = fn; };

// ---------- sections ----------
section('firstRun', async () => {
    await setStorage({});
    await reload();
    check('first-run screen', (await count('.empty-state')) === 1);
    check('footer credit', (await text('.footer span, .bar-foot span'))?.includes('cdinh'));
});

section('categories', async () => {
    await setStorage({});
    await reload();
    await click('.empty-state button');
    await wait();
    check('dialog opens', await dialogOpen());
    await click('#appDialog button[type=submit]');
    check('empty name refused', (await dialogOpen()) && !(await js(`document.querySelector('.dialog-error').hidden`)));
    await setValue('#appDialog .dialog-field input', 'Read later');
    await js(`document.querySelectorAll('#appDialog input')[1].value = 'For the weekend'`);
    await click('#appDialog button[type=submit]');
    await wait();
    const data = await storage();
    check('category created', data.savedLinksData['Read later']?.description === 'For the weekend');
    check('new category is expanded', (await count('.category:not(.collapsed)')) === 1);
    await click('#addCategoryBtn');
    await wait();
    await setValue('#appDialog .dialog-field input', 'Read later');
    await click('#appDialog button[type=submit]');
    check('duplicate name refused', await dialogOpen());
    await click('#appDialog .btn-plain');
    await wait();
    check('cancel closes dialog', !(await dialogOpen()));
});

section('links', async () => {
    await setStorage({ savedLinksData: { 'Read later': { description: '', color: '#1329a1', links: [] } }, categoriesOrder: ['Read later'] });
    await reload();
    await click('.category-header');
    await wait(350);
    await click('.add-link-btn');
    await wait(400);
    check('add form open', (await count('.category-add-form')) === 1);
    await setValue('.form-link-url', 'example.com/page');
    await key('.form-link-url', 'Enter');
    await wait();
    let data = await storage();
    check('link saved with https', data.savedLinksData['Read later'].links[0]?.url === 'https://example.com/page');
    check('form closes after save', (await count('.category-add-form')) === 0);
    check('title falls back to the site', (await text('.link-title')) === 'example.com');
    await click('.add-link-btn');
    await wait(300);
    await key('.form-link-url', 'Escape');
    check('Escape cancels the form', (await count('.category-add-form')) === 0);
    await click('.edit-link');
    await wait();
    check('edit mode', (await count('.link-editor')) === 1);
    await setValue('.link-desc-input', 'A better title');
    await js(`document.activeElement.blur()`);
    await wait();
    data = await storage();
    check('edit commits on blur', data.savedLinksData['Read later'].links[0].description === 'A better title' && (await count('.link-editor')) === 0);
    await click('.edit-link');
    await wait();
    await setValue('.link-desc-input', 'Should not stay');
    await key('.link-desc-input', 'Escape');
    await wait();
    data = await storage();
    check('Escape cancels the edit', data.savedLinksData['Read later'].links[0].description === 'A better title');
});

section('undo', async () => {
    await setStorage({ savedLinksData: { A: { description: '', color: '#1329a1', links: [link('One'), link('Two'), link('Three')] } }, categoriesOrder: ['A'] });
    await reload();
    check('categories start collapsed', (await count('.category.collapsed')) === 1);
    await click('.category-header');
    await wait(350);
    check('header click expands', (await count('.category.collapsed')) === 0);
    await js(`document.querySelectorAll('.delete-link')[1].click()`);
    await wait();
    check('delete link is immediate', (await linkNames('A')) === 'One,Three');
    await click('.toast button');
    await wait();
    check('Undo restores position', (await linkNames('A')) === 'One,Two,Three');
    check('category stays expanded after re-render', (await count('.category:not(.collapsed)')) === 1);
});

section('reorder', async () => {
    await setStorage({ savedLinksData: { A: { description: '', color: '#1329a1', links: [link('One'), link('Two'), link('Three')] }, B: { description: '', color: '#ff6b35', links: [link('Bee')] } }, categoriesOrder: ['A', 'B'] });
    await reload();
    await js(`document.querySelectorAll('.category-header').forEach((h) => h.click())`);
    await wait(350);
    await js(`(() => { const list = document.querySelector('.category[data-category="A"] .category-links'); const items = list.querySelectorAll('.link-item'); list.append(items[0]); return Sortable.get(list).option('onEnd')({ from: list, to: list, item: items[0] }); })()`);
    await wait();
    check('reorder within category', (await linkNames('A')) === 'Two,Three,One');
    await js(`(() => { const from = document.querySelector('.category[data-category="A"] .category-links'); const to = document.querySelector('.category[data-category="B"] .category-links'); const item = from.querySelector('.link-item'); to.prepend(item); return Sortable.get(from).option('onEnd')({ from, to, item }); })()`);
    await wait();
    check('move to another category', (await linkNames('B')).startsWith('Two') && (await linkNames('A')) === 'Three,One');
    await js(`(() => { const list = document.getElementById('linksList'); list.prepend(list.querySelector('.category[data-category="B"]')); return Sortable.get(list).option('onEnd')({ from: list, to: list, item: list.children[0] }); })()`);
    await wait();
    check('reorder categories', (await storage()).categoriesOrder.join() === 'B,A');
    await click('.category[data-category="A"] .edit-category');
    await wait();
    await setValue('.category-name-edit', 'B');
    await js(`document.activeElement.blur()`);
    await wait();
    check('rename to existing name refused', !!(await text('.toast')) && !!(await storage()).savedLinksData.A);
    await click('.category[data-category="A"] .edit-category');
    await wait();
    await setValue('.category-name-edit', 'Renamed');
    await setValue('.category-desc-edit', 'New description');
    await js(`document.activeElement.blur()`);
    await wait();
    const data = await storage();
    check('rename commits both fields', data.savedLinksData.Renamed?.description === 'New description' && !data.savedLinksData.A && data.categoriesOrder.join() === 'B,Renamed');
    check('renamed category stays expanded', (await count('.category[data-category="Renamed"]:not(.collapsed)')) === 1);
});

section('search', async () => {
    await setStorage({ savedLinksData: { A: { description: '', color: '#1329a1', links: [link('One'), link('Three')] }, B: { description: '', color: '#ff6b35', links: [link('Bee')] } }, categoriesOrder: ['A', 'B'] });
    await reload();
    check('collapsed before search', (await count('.category.collapsed')) === 2);
    await setValue('#searchInput', 'three');
    await wait(300);
    check('search shows result inside collapsed category', (await count('.link-item')) === 1 && (await count('.category.collapsed')) === 0);
    await setValue('#searchInput', 'zzzz');
    await wait(300);
    check('no results message', (await count('.no-results')) === 1);
    await key('#searchInput', 'Escape');
    await wait();
    check('Escape clears search', (await js(`document.getElementById('searchInput').value`)) === '' && (await count('.category')) === 2);
});

section('scroll', async () => {
    const many = Array.from({ length: 30 }, (_, i) => link(`Link${i}`));
    await setStorage({ savedLinksData: { Long: { description: '', color: '#06b6f5', links: many } }, categoriesOrder: ['Long'] });
    await reload();
    await click('.category-header');
    await wait(350);
    await js(`document.getElementById('linksList').scrollTop = 400`);
    await js(`document.querySelectorAll('.link-checkbox')[12].click()`);
    await wait();
    check('done saved', (await storage()).savedLinksData.Long.links[12].done === true);
    check('done keeps scroll position', (await js(`document.getElementById('linksList').scrollTop`)) === 400);
    await js(`document.querySelectorAll('.delete-link')[13].click()`);
    await wait();
    check('re-render keeps scroll position', (await js(`document.getElementById('linksList').scrollTop`)) === 400);
    check('no horizontal overflow', await js(`(() => { const l = document.getElementById('linksList'); return l.scrollWidth <= l.clientWidth; })()`));
    const before = (await cdp.send('Target.getTargets')).targetInfos.filter((t) => t.url.includes('link0.test')).length;
    await click('.link-main');
    await wait(800);
    const opened = (await cdp.send('Target.getTargets')).targetInfos.filter((t) => t.url.includes('link0.test'));
    check('click opens the link', opened.length === before + 1);
    for (const t of opened) await cdp.send('Target.closeTarget', { targetId: t.targetId });
    await cdp.send('Page.bringToFront', {}, page);
});

section('dialogs', async () => {
    await setStorage({ savedLinksData: { Long: { description: '', color: '#06b6f5', links: [link('x')] } }, categoriesOrder: ['Long'] });
    await reload();
    await click('.delete-category');
    await wait();
    check('delete asks first', !!(await storage()).savedLinksData.Long);
    check('focus on Cancel for destructive dialog', (await js(`document.activeElement.classList.contains('btn-plain')`)));
    await click('#appDialog .btn-primary');
    await wait();
    check('delete category', !(await storage()).savedLinksData?.Long);
});

section('import', async () => {
    await reload();
    const file = join(profile, 'import-test.json');
    writeFileSync(file, JSON.stringify({ data: { Imported: { description: 'x', color: '#1f9d55', links: [{ url: 'https://i.test', description: 'I', done: false }] } }, categoriesOrder: ['Imported'] }));
    const { root } = await cdp.send('DOM.getDocument', {}, page);
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#importFile' }, page);
    await cdp.send('DOM.setFileInputFiles', { files: [file], nodeId }, page);
    await wait(400);
    check('import asks first', await dialogOpen());
    await click('#appDialog .btn-primary');
    await wait();
    check('import replaces data', !!(await storage()).savedLinksData.Imported);
});

section('hostile', async () => {
    const title = `Quote " end"><img src=x onerror="window.pwned=1"><b>bold</b> & 'single'`;
    const name = `Cat"><img src=x id=injected>`;
    await setStorage({ savedLinksData: { [name]: { description: `D"><script>window.pwned=2</script><img src=x>`, color: `#000"><img src=x>`, links: [{ url: `https://example.com/?a="><img src=x>`, description: title, done: false, timestamp: 1 }] } }, categoriesOrder: [name] });
    await reload();
    await click('.delete-category');
    await wait();
    const h = await js(`({ images: document.querySelectorAll('#linksList img, #appDialog img').length, bold: document.querySelectorAll('#linksList b').length, pwned: window.pwned ?? null, name: document.querySelector('.category-name').textContent, title: document.querySelector('.link-title').textContent, dialog: document.querySelector('#appDialog h2').textContent })`);
    check('hostile data stays text', h.images === 0 && h.bold === 0 && h.pwned === null && h.name === name && h.title === title && h.dialog.includes(name), h);
    await click('#appDialog .btn-plain');
    await wait();
});

section('account', async () => {
    await setStorage({ savedLinksData: { A: { description: '', color: '#1329a1', links: [link('One')] } }, categoriesOrder: ['A'] });
    await reload();
    const fake = { userId: 'u1', email: 'demo.user@example.com', name: 'Demo', picture: '' };
    await js(`updateSyncUI(${q(fake)}, { userId: 'u1', sheetId: 'x' })`);
    await js(`document.querySelector('.avatar-btn').click()`);
    await wait(300);
    check('account menu opens', (await js(`document.getElementById('accountMenu').matches(':popover-open')`)) && (await text('#userEmail')) === fake.email);
    await js(`document.getElementById('accountMenu').hidePopover(); updateSyncUI(null)`);
});

section('i18n', async () => {
    await setStorage({ uiSettings: { lang: 'vi' }, savedLinksData: { A: { description: '', color: '#1329a1', links: [link('One')] } }, categoriesOrder: ['A'] });
    await reload();
    check('vi: search placeholder', (await js(`document.getElementById('searchInput').placeholder`)) === 'Tìm link');
    check('vi: new category button', (await text('#addCategoryBtn'))?.includes('Nhóm mới'));
    const foot = await js(`document.querySelector('#exportBtn').textContent + '|' + document.querySelector('#importBtn').textContent`);
    check('vi: footer export/import', foot.includes('Xuất') && foot.includes('Nhập'), foot);
    await setStorage({ uiSettings: { lang: 'en' }, savedLinksData: { A: { description: '', color: '#1329a1', links: [link('One')] } }, categoriesOrder: ['A'] });
    await reload();
    check('en: search placeholder', (await js(`document.getElementById('searchInput').placeholder`)) === 'Search links');
    check('en: new category button', (await text('#addCategoryBtn'))?.includes('New category'));
    check('same keys in both languages', await js(`Object.keys(STRINGS.en).sort().join() === Object.keys(STRINGS.vi).sort().join()`));
    check('t() output is plain text', (await js(`t('deleteCategoryTitle', { name: '<b>' })`)).includes('<b>'));

    const { targetInfos } = await cdp.send('Target.getTargets');
    const worker = targetInfos.find((t) => t.type === 'service_worker' && t.url.includes(extId));
    const sw = await cdp.attach(worker.targetId);
    await cdp.send('Runtime.enable', {}, sw);
    await js(`chrome.storage.local.set({ uiSettings: { lang: 'vi' } })`);
    await wait(600);
    const vi = await cdp.evaluate(sw, `globalThis.__menuTitles || []`);
    check('context menu follows language', vi.includes('Lưu trang vào...'), vi);
    await js(`chrome.storage.local.set({ uiSettings: { lang: 'en' } })`);
    await wait(600);
    const en = await cdp.evaluate(sw, `globalThis.__menuTitles || []`);
    check('context menu switches back', en.includes('Save page to...'), en);
});

section('settings', async () => {
    const bg = () => js(`getComputedStyle(document.body).backgroundColor`);
    const seed = { savedLinksData: { A: { description: '', color: '#1329a1', links: [link('One')] } }, categoriesOrder: ['A'] };
    await setStorage(seed);
    await reload();
    check('light by default', !(await js(`document.documentElement.dataset.theme`)) && (await bg()) === 'rgb(238, 240, 247)', await bg());
    check('settings button exists', (await count('#settingsBtn')) === 1);
    await click('#settingsBtn');
    await wait(300);
    check('settings panel opens', await js(`document.getElementById('settingsPanel').matches(':popover-open')`));
    await click('#themeDark');
    await wait(500);
    check('dark theme applies', (await bg()) === 'rgb(10, 11, 19)', await bg());

    // The theme must be in place before DOMContentLoaded, so dark never flashes light
    const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded', () => { window.__themeAtDCL = document.documentElement.dataset.theme || 'light'; }, { capture: true });` }, page);
    await reload();
    check('dark remembered without a light flash', (await js(`window.__themeAtDCL`)) === 'dark');
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }, page);

    await click('#settingsBtn');
    await wait(300);
    await setValue('#transparencyRange', '32');
    await setValue('#blurRange', '2');
    await wait(400);
    const vars = await js(`(() => { const s = getComputedStyle(document.documentElement); return { fill: s.getPropertyValue('--fill').trim(), blur: s.getPropertyValue('--blur').trim(), filter: getComputedStyle(document.querySelector('.category')).backdropFilter }; })()`);
    check('transparency and blur reach CSS', parseFloat(vars.fill) === 0.68 && vars.blur === '2px' && vars.filter.includes('blur(2px)'), vars);
    await setValue('#blurRange', '0');
    await wait(400);
    check('blur 0 removes backdrop-filter', (await js(`getComputedStyle(document.querySelector('.category')).backdropFilter`)) === 'none');
    const saved = (await storage()).uiSettings;
    check('settings saved to storage', saved.theme === 'dark' && saved.lang === (await js('getLang()')) && saved.transparency === 32 && saved.blur === 0, saved);
    await click('#settingsReset');
    await wait(400);
    const reset = await js(`({ t: document.getElementById('transparencyRange').value, b: document.getElementById('blurRange').value })`);
    check('reset restores 32 and 2', reset.t === '32' && reset.b === '2', reset);

    // Closing the popup right after moving a slider must not lose the value
    await setValue('#blurRange', '7');
    await cdp.send('Page.navigate', { url: POPUP }, page);
    await sleep(1100);
    check('slider value survives an immediate close', (await storage()).uiSettings?.blur === 7, (await storage()).uiSettings);
    await click('#settingsBtn');
    await wait(300);

    await click('#langVi');
    await wait(300);
    check('language switches live', (await js(`document.getElementById('settingsBtn').getAttribute('aria-label')`)) === 'Cài đặt' && (await js(`document.getElementById('searchInput').placeholder`)) === 'Tìm link');
    await click('#langEn');
    await wait(300);

    await setStorage({ ...seed, uiSettings: { transparency: 500, blur: 'x', lang: 'fr', theme: 'pink' } });
    await js(`localStorage.removeItem('uiSettings')`);
    await reload();
    const bad = await js(`({ t: document.getElementById('transparencyRange').value, b: document.getElementById('blurRange').value, lang: getLang(), def: defaultLang(), theme: document.documentElement.dataset.theme || 'light' })`);
    check('corrupted settings are clamped or defaulted', bad.t === '100' && bad.b === '2' && bad.lang === bad.def && bad.theme === 'light', bad);
    await js(`localStorage.removeItem('uiSettings')`);
});

section('visual', async () => {
    const longName = 'Tài liệu học tập và nghiên cứu về trí tuệ nhân tạo, khoa học dữ liệu, kỹ thuật phần mềm ứng dụng';
    const longUrl = `https://example.com/${'đường-dẫn-rất-dài/'.repeat(16)}`;
    const many = Array.from({ length: 150 }, (_, i) => link(`Link ${i} với tiêu đề tiếng Việt có dấu đầy đủ`, { url: i === 0 ? longUrl : `https://site${i}.test/path` }));
    await setStorage({ savedLinksData: { [longName]: { description: 'Mô tả nhóm', color: '#8e24aa', links: many } }, categoriesOrder: [longName] });
    await reload();
    await js(`document.fonts.load('600 14px "Be Vietnam Pro"')`);
    // fonts.check() is also true when no such face is declared, so look for a loaded face instead
    check('Be Vietnam Pro is bundled and loads', await js(`document.fonts.ready.then(() => [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Be Vietnam Pro' && f.status === 'loaded'))`));
    check('no Font Awesome left', (await count('[class*="fa-"]')) === 0);
    const icons = await js(`fetch('icons/phosphor-light.svg').then(r => r.text()).then(svg => [...document.querySelectorAll('svg.icon use')].map(u => u.getAttribute('href').split('#')[1]).filter(id => !svg.includes('id="' + id + '"')))`);
    check('every icon exists in the sprite', icons.length === 0 && (await count('svg.icon use')) > 3, icons);
    const page = await js(`(() => { const s = getComputedStyle(document.body); return { bg: s.backgroundColor, image: s.backgroundImage }; })()`);
    check('flat background with dot grid', page.bg === 'rgb(238, 240, 247)' && page.image.includes('radial-gradient'), page);
    check('no linear gradients anywhere', (await js(`[...document.querySelectorAll('*')].filter(el => getComputedStyle(el).backgroundImage.includes('linear-gradient')).length`)) === 0);
    const bars = await js(`['.bar-top', '.bar-foot'].map(sel => { const s = getComputedStyle(document.querySelector(sel)); return [s.position, s.backdropFilter]; })`);
    check('glass bars float over the list', bars.every(([pos, filter]) => (pos === 'absolute' || pos === 'sticky') && filter.includes('blur(')), bars);
    await click('.category-header');
    await wait(400);
    check('chain line on an open category', (await js(`parseFloat(getComputedStyle(document.querySelector('.category:not(.collapsed) .category-links'), '::before').height) || 0`)) > 0);
    const fit = await js(`(() => { const l = document.getElementById('linksList'); return { fits: l.scrollWidth <= l.clientWidth, ellipsis: getComputedStyle(document.querySelector('.link-title')).textOverflow, name: getComputedStyle(document.querySelector('.category-name')).textOverflow }; })()`);
    check('long Vietnamese names and URLs stay inside 420px', fit.fits && fit.ellipsis === 'ellipsis' && fit.name === 'ellipsis', fit);
    const ms = await js(`(() => { const t = performance.now(); renderLinks(); return performance.now() - t; })()`);
    check('150 links render under 120ms', ms < 120, Math.round(ms));
    await js(`saveSettings({ blur: 0 })`);
    await wait(300);
    check('blur 0 turns glass filters off', (await js(`[...document.querySelectorAll('.category, .link-item')].every(el => getComputedStyle(el).backdropFilter === 'none')`)));
    await js(`saveSettings({ blur: 2 })`);
    await wait(300);
});

section('drag', async () => {
    const seed = {
        savedLinksData: {
            A: { description: '', color: '#6ccb47', links: [link('one'), link('two'), link('three')] },
            B: { description: '', color: '#ff6b35', links: [link('bee')] },
            C: { description: '', color: '#06b6f5', links: [] },
        },
        categoriesOrder: ['A', 'B', 'C'],
    };
    const order = async () => (await storage()).categoriesOrder.join();
    const under = async (sel, i = 0) => { const b = await box(sel, i); return { x: b.x, y: b.y + 14 }; };

    await setStorage(seed);
    await reload();
    await drag(await box('.category-header .category-text', 0), await under('.category-header', 2));
    check('drag a category by its header', (await order()) === 'B,C,A', await order());

    await setStorage(seed);
    await reload();
    await click('.category[data-category="A"] .category-header');
    await wait(500);
    await drag(await box('.category[data-category="A"] .link-title', 0), await under('.category[data-category="A"] .link-item', 2));
    check('drag a link by its row', (await linkNames('A')) === 'two,three,one', await linkNames('A'));

    await setStorage(seed);
    await reload();
    await click('.category[data-category="A"] .category-header');
    await wait(500);
    await drag(await box('.category[data-category="A"] .link-title', 1), await box('.category[data-category="B"] .category-header .category-text'), { hold: 700 });
    await wait(300);
    check('drop a link on a collapsed category', (await linkNames('B')).split(',').includes('two') && (await linkNames('A')) === 'one,three', [await linkNames('A'), await linkNames('B')]);
    check('collapsed category opens while hovering', (await count('.category[data-category="B"]:not(.collapsed)')) === 1);

    await setStorage(seed);
    await reload();
    await click('.category[data-category="A"] .category-header');
    await wait(500);
    const before = (await cdp.send('Target.getTargets')).targetInfos.filter((t) => t.url.includes('one.test')).length;
    const p = await box('.category[data-category="A"] .link-title', 0);
    await drag(p, { x: p.x + 2, y: p.y + 1 }, { hold: 50, steps: 2 });
    await wait(600);
    const opened = (await cdp.send('Target.getTargets')).targetInfos.filter((t) => t.url.includes('one.test'));
    check('a click with a small wobble opens the link', opened.length === before + 1 && (await linkNames('A')) === 'one,two,three');
    for (const t of opened) await cdp.send('Target.closeTarget', { targetId: t.targetId });
    await cdp.send('Page.bringToFront', {}, page);
    await wait(300);

    // Mid-flight: the lifted copy must sit under the pointer, the gap must read as a drop slot,
    // and the category being hovered must be marked
    const start = await box('.category[data-category="A"] .link-title', 0);
    const target = await box('.category[data-category="A"] .link-item', 2);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x, y: start.y, button: 'none' }, page);
    await mouse('mousePressed', start.x, start.y);
    for (let i = 1; i <= 12; i++) {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x + 6 * i / 12, y: start.y + (target.y - start.y) * i / 12, button: 'left', buttons: 1 }, page);
        await sleep(40);
    }
    await sleep(300);
    const mid = await js(`(() => {
        const lifted = document.querySelector('.drag-lifted');
        const r = lifted?.getBoundingClientRect();
        const slot = document.querySelector('.drag-placeholder');
        return {
            liftedCount: document.querySelectorAll('.drag-lifted').length,
            underPointer: !!r && ${target.y} >= r.top && ${target.y} <= r.bottom && ${start.x + 6} >= r.left && ${start.x + 6} <= r.right,
            liftedOnBody: lifted?.parentElement === document.body,
            slotDashed: slot ? getComputedStyle(slot).outlineStyle : null,
            targetMarked: document.querySelector('.category[data-category="A"]').classList.contains('drop-target'),
        };
    })()`);
    await mouse('mouseReleased', start.x + 6, target.y);
    await wait(500);
    check('only one lifted copy, right under the pointer', mid.liftedCount === 1 && mid.underPointer && mid.liftedOnBody, mid);
    check('the gap reads as a drop slot', mid.slotDashed === 'dashed', mid.slotDashed);
    check('the hovered category is marked as the drop target', mid.targetMarked);
    check('no drop-target mark left after the drop', (await count('.drop-target')) === 0);
    await setStorage(seed);
    await reload();
    await click('.category[data-category="A"] .category-header');
    await wait(500);

    const c = await box('.category[data-category="A"] .link-checkbox', 0);
    await drag(c, { x: c.x, y: c.y + 40 });
    check('pressing the checkbox never drags', (await linkNames('A')) === 'one,two,three');

    await setValue('#searchInput', 'o');
    await wait(300);
    await drag(await box('.link-title', 0), await under('.link-item', 1));
    check('no dragging while searching', (await linkNames('A')) === 'one,two,three' && (await order()) === 'A,B,C');
    await setValue('#searchInput', '');
});

// ---------- run ----------
try {
    await cdp.send('Page.navigate', { url: POPUP }, page);
    await sleep(1200);
    for (const [name, fn] of Object.entries(SECTIONS)) {
        if (only.length && !only.includes(name)) continue;
        console.log(`\n# ${name}`);
        try {
            await fn();
        } catch (error) {
            check(`${name} ran without throwing`, false, error.message.split('\n')[0]);
        }
    }
    const errors = cdp.errors.filter((e) => !/does not conform to the required format/.test(e));
    check('no console errors', errors.length === 0, errors.slice(0, 6));
} finally {
    await js(`chrome.storage.local.clear()`).catch(() => {});
    await cdp.close();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL PASSED (${passed})`);
process.exit(failed ? 1 : 0);
