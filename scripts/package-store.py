"""Build the Chrome Web Store ZIP in dist/. Run: python scripts/package-store.py

Allowlist, so docs/, store/ and repo files never ship. Drops the manifest "key" (development ID only).
"""
import json
import pathlib
import re
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = [
    'background.js', 'google-auth.js', 'sheets-sync.js', 'category-colors.js',
    'popup.html', 'popup.css', 'popup.js', 'i18n.js', 'settings.js', 'settings-boot.js', 'Sortable.min.js',
    'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png',
    'icons/phosphor-light.svg', 'icons/PHOSPHOR-LICENSE.txt', 'fonts/OFL.txt',
    *[f'fonts/be-vietnam-pro-{subset}-{weight}-normal.woff2' for subset in ('latin', 'vietnamese') for weight in (400, 500, 600, 700)],
]

manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
manifest.pop('key', None)
assert len(manifest['description']) <= 132, 'Web Store limit for the manifest description'

# Fail on a file the extension loads but the allowlist forgot
page = (ROOT / 'popup.html').read_text(encoding='utf-8')
loaded = re.findall(r'(?:src|href)="([^"#]+)"', page)
loaded += re.findall(r"importScripts\((.*?)\)", (ROOT / 'background.js').read_text(encoding='utf-8'))[0].replace("'", '').split(', ')
missing = [name for name in loaded if not name.startswith('http') and name not in FILES]
assert not missing, f'Not in the allowlist: {missing}'

output = ROOT / 'dist' / f"save-link-extension-{manifest['version']}.zip"
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('manifest.json', json.dumps(manifest, indent=4))
    for name in FILES:
        archive.write(ROOT / name, name)

print(f'{output.relative_to(ROOT)}: {len(FILES) + 1} files, {output.stat().st_size / 1024:.0f} KB')
