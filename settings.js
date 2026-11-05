// Display settings, kept per browser in chrome.storage.local (never synced to the sheet).
// localStorage holds a copy so settings-boot.js can paint the right theme before this file runs.

const DEFAULT_SETTINGS = { theme: 'light', transparency: 32, blur: 2 };
const SETTINGS_KEY = 'uiSettings';

let currentSettings = null;
let settingsSaveTimer = null;

function clampSetting(value, min, max, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

function normalizeSettings(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
        theme: source.theme === 'dark' ? 'dark' : 'light',
        lang: STRINGS[source.lang] ? source.lang : defaultLang(),
        transparency: clampSetting(source.transparency, 0, 100, DEFAULT_SETTINGS.transparency),
        blur: clampSetting(source.blur, 0, 24, DEFAULT_SETTINGS.blur),
    };
}

function applySettings(settings) {
    const root = document.documentElement;
    if (settings.theme === 'dark') root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    // Rounded so 32 gives exactly 0.68 instead of 0.6799999999999999
    root.style.setProperty('--fill', String(Math.round(100 - settings.transparency) / 100));
    root.style.setProperty('--blur', `${settings.blur}px`);
    if (settings.blur === 0) root.dataset.glass = 'off';
    else delete root.dataset.glass;
    setLang(settings.lang);
    applyI18n(document);
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* first paint just falls back to the defaults */ }
}

async function loadSettings() {
    const { [SETTINGS_KEY]: stored } = await chrome.storage.local.get(SETTINGS_KEY);
    currentSettings = normalizeSettings(stored);
    return currentSettings;
}

// Applies at once (live preview while a slider moves); the storage write is debounced
async function saveSettings(patch) {
    currentSettings = normalizeSettings({ ...(currentSettings || await loadSettings()), ...patch });
    applySettings(currentSettings);
    clearTimeout(settingsSaveTimer);
    settingsSaveTimer = setTimeout(flushSettings, 150);
    return currentSettings;
}

// Write a pending change now. Called on pagehide: the popup can close inside the debounce window.
// chrome.storage.local.set is called synchronously here, so the write is sent before the page goes.
function flushSettings() {
    if (settingsSaveTimer === null || !currentSettings) return;
    clearTimeout(settingsSaveTimer);
    settingsSaveTimer = null;
    chrome.storage.local.set({ [SETTINGS_KEY]: currentSettings });
}
