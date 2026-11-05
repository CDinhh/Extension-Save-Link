# Chrome Web Store submission

Text for the Developer Dashboard forms. Images are in this folder. Build the package with `python scripts/package-store.py`.

## Package

Upload `dist/save-link-extension-<version>.zip`.

## Store listing

**Language:** English

**Category:** Productivity, Tools

**Description:**

```
Save Link Extension keeps the pages you want to come back to in one place.

Save the current page from the right-click menu, or click + in the popup to add it to a category. Click a link to open it. Group links into categories, give each category a color, and drag to reorder them. Search by address or title as you type, and tick off what you have read or finished.

Your links are stored in your browser, and the extension works without an account. If you want the same links in other browsers, sign in with Google. The extension then syncs them through a Google Sheet in your own Google Drive. You can open and edit that sheet at any time.

Features
- Categories with custom colors and descriptions
- Save the current page from the right-click menu
- Search by address or title
- Done checkboxes
- Edit in place and drag to reorder
- Light and dark themes, adjustable glass transparency, Vietnamese and English
- Open or copy a link in one click, and undo a deleted link
- Export and import as a JSON file
- Optional sync across browsers with a Google Sheet in your Drive

Privacy
The extension has no developer server, analytics or ads. It can only access the sheet it creates, not your other Drive files.

Privacy policy: https://cdinhh.github.io/Extension-Save-Link/privacy.html
Source code: https://github.com/CDinhh/Extension-Save-Link
```

**Store icon:** `icons/icon128.png`

**Screenshots:** `screenshot-1.jpg`, `screenshot-2.jpg`

**Small promo tile:** `promo-small.jpg`

**Homepage URL:** https://cdinhh.github.io/Extension-Save-Link/

**Support URL:** https://github.com/CDinhh/Extension-Save-Link/issues

## Privacy

**Single purpose:**

```
Save web links into categories, organize and search them, and optionally sync them across browsers through a Google Sheet in the user's own Google Drive.
```

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Stores the user's links, categories and sync status in the browser. |
| `activeTab` | Reads the URL and title of the current tab only when the user saves it from the right-click menu, or clicks + in the popup, which fills the add-link form with the current page. |
| `contextMenus` | Adds the right-click menu that saves the current page to a category. |
| `notifications` | Confirms that a page was saved from the right-click menu, because the popup is not open at that moment. |
| `identity` | Runs the optional Google sign-in with launchWebAuthFlow, so links can sync to the user's Google Sheet. |

**Remote code:** No, I am not using remote code.

**Data usage, what is collected:**

- [x] Personally identifiable information (Google account name, email address and ID, used to show the signed-in account)
- [x] Authentication information (Google access token, used to call Google APIs during sync)
- [x] Website content (URL and title of pages the user chooses to save)

**Certifications:** tick all three (data not sold, not used for unrelated purposes, not used for creditworthiness).

**Privacy policy URL:** https://cdinhh.github.io/Extension-Save-Link/privacy.html

## Test instructions

```
No test account is needed. All features except sync work without signing in.

To test sync, click Sign In in the popup and use any Google account. The extension creates a sheet named "Link Inventory Extension [Dont delete]" in that account's Drive. Click the profile picture in the popup, then "Open Google Sheet".

To test saving a page, right-click any web page and choose "Save page to...".
```

## After the first upload

The store assigns a new extension ID, and Google sign-in fails with `redirect_uri_mismatch` until that ID is registered.

1. Copy the item ID from the dashboard.
2. In Google Cloud, open Google Auth Platform, Clients, then the web client.
3. Add this Authorized redirect URI: `https://<item-id>.chromiumapp.org/oauth-redirect.html`
4. Keep the existing development URI. Then submit for review.
