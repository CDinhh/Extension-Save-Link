// Colors for new categories (shared by popup.js and background.js)

// Distinct, readable colors (lowercase, as <input type="color"> reports them)
const CATEGORY_PALETTE = [
    '#2196f3', '#e53935', '#43a047', '#fb8c00', '#8e24aa', '#00acc1',
    '#d81b60', '#3949ab', '#7cb342', '#f4511e', '#5e35b1', '#00897b',
    '#6d4c41', '#546e7a', '#c0ca33', '#ffb300'
];

// A random palette color no existing category uses; once the palette is used up, a random hue
function pickCategoryColor(linksData) {
    const used = new Set(Object.values(linksData).map(category => (category.color || '').toLowerCase()));
    const free = CATEGORY_PALETTE.filter(color => !used.has(color));
    if (free.length > 0) {
        return free[Math.floor(Math.random() * free.length)];
    }

    let color;
    do {
        color = hslToHex(Math.random() * 360, 65, 45);
    } while (used.has(color));
    return color;
}

function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const channel = (n) => {
        const k = (n + h / 30) % 12;
        const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(value * 255).toString(16).padStart(2, '0');
    };
    return `#${channel(0)}${channel(8)}${channel(4)}`;
}
