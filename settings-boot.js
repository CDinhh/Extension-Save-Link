// Runs in <head> before the first paint: applies the last known display settings so dark mode never flashes light.
// settings.js re-applies the stored values once chrome.storage has answered.
try {
    const saved = JSON.parse(localStorage.getItem('uiSettings') || 'null');
    if (saved) {
        const root = document.documentElement;
        const transparency = Math.min(100, Math.max(0, Number(saved.transparency) || 0));
        const blur = Math.min(24, Math.max(0, Number(saved.blur) || 0));
        if (saved.theme === 'dark') root.dataset.theme = 'dark';
        root.style.setProperty('--fill', String(Math.round(100 - transparency) / 100));
        root.style.setProperty('--blur', `${blur}px`);
        if (blur === 0) root.dataset.glass = 'off';
    }
} catch { /* storage blocked or corrupted: defaults from the stylesheet */ }
