// Auth + sync run here (not in the popup) so they survive the popup closing
importScripts('google-auth.js', 'sheets-sync.js', 'category-colors.js');

// Storage key
const STORAGE_KEY = 'savedLinksData';
const ORDER_KEY = 'categoriesOrder';

// Create context menu when extension is installed
chrome.runtime.onInstalled.addListener(() => {
    scheduleContextMenuUpdate();
    // Leftovers from the old Firebase sync
    chrome.storage.local.remove(['firebaseUser', 'firebaseIdToken']);
});

// Update context menu and sync to cloud when storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;

    if (changes[STORAGE_KEY]) {
        scheduleContextMenuUpdate();
    }

    // Any local edit (popup, context menu, import) bumps dataLastModified.
    // Skip the change written by syncLocalData itself (it already matches the cloud).
    const modified = changes.dataLastModified;
    if (modified && modified.newValue && modified.newValue !== lastSyncWrite) {
        scheduleSync();
    }
});

// Serialize menu rebuilds so concurrent removeAll/create calls don't interleave
let contextMenuChain = Promise.resolve();
function scheduleContextMenuUpdate() {
    contextMenuChain = contextMenuChain
        .then(updateContextMenu)
        .catch(error => console.error('Context menu update error:', error));
}

// Function to update context menu with current categories
async function updateContextMenu() {
    // Remove all existing context menus
    await chrome.contextMenus.removeAll();

    // Get current data
    const result = await chrome.storage.local.get([STORAGE_KEY, ORDER_KEY]);
    const linksData = result[STORAGE_KEY] || {};
    const order = result[ORDER_KEY] || [];
    const categories = [
        ...order.filter(cat => linksData[cat]),
        ...Object.keys(linksData).filter(cat => !order.includes(cat))
    ];

    if (categories.length === 0) {
        // No categories, create single option to save to new category
        chrome.contextMenus.create({
            id: 'saveLinkToNew',
            title: 'Save page to new category',
            contexts: ['page']
        });
    } else {
        // Create parent menu
        chrome.contextMenus.create({
            id: 'saveLinkParent',
            title: 'Save page to...',
            contexts: ['page']
        });

        // Create submenu for each category
        categories.forEach((category) => {
            chrome.contextMenus.create({
                id: `saveToCategory_${category}`,
                parentId: 'saveLinkParent',
                title: category,
                contexts: ['page']
            });
        });

        // Add separator
        chrome.contextMenus.create({
            id: 'separator',
            parentId: 'saveLinkParent',
            type: 'separator',
            contexts: ['page']
        });

        // Add option to create new category
        chrome.contextMenus.create({
            id: 'saveLinkToNew',
            parentId: 'saveLinkParent',
            title: '+ New category',
            contexts: ['page']
        });
    }
}

// Second-level labels used under country domains (github.com.vn, bbc.co.uk)
const SECOND_LEVEL_LABELS = new Set(['com', 'co', 'net', 'org', 'gov', 'edu', 'ac', 'info', 'biz']);

// Default name for a new category: the site's name without its domain ending
// (www.github.com -> "Github", docs.google.com -> "Google", vnexpress.net -> "Vnexpress"), else the page title
function suggestCategoryName(url, title) {
    try {
        const { protocol, hostname } = new URL(url);
        if ((protocol === 'http:' || protocol === 'https:') && hostname) {
            const labels = hostname.split('.');
            // IP addresses and single-label hosts (localhost) are kept as they are
            if (labels.length < 2 || /^\d+$/.test(labels[labels.length - 1]) || hostname.includes(':')) {
                return hostname;
            }
            labels.pop(); // .com, .vn, ...
            if (labels.length > 1 && SECOND_LEVEL_LABELS.has(labels[labels.length - 1])) {
                labels.pop(); // .com in .com.vn, .co in .co.uk
            }
            const name = labels[labels.length - 1];
            return name.charAt(0).toUpperCase() + name.slice(1);
        }
    } catch {
        // Not a valid URL: fall back to the title
    }
    return (title || '').trim().slice(0, 40) || 'New category';
}

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const url = tab.url;
    const title = tab.title;

    // Get existing data
    const result = await chrome.storage.local.get([STORAGE_KEY, ORDER_KEY]);
    const linksData = result[STORAGE_KEY] || {};
    const categoriesOrder = result[ORDER_KEY] || [];

    if (info.menuItemId === 'saveLinkToNew') {
        // Let the user name the category in the popup, prefilled with the site's domain
        const pending = { url, title, suggestedName: suggestCategoryName(url, title) };
        await chrome.storage.session.set({ pendingNewCategory: pending });
        try {
            await chrome.action.openPopup();
            return;
        } catch (error) {
            // openPopup needs Chrome 127+ and a focused window: save under the suggested name instead
            console.warn('Could not open popup:', error);
            await chrome.storage.session.remove('pendingNewCategory');
        }

        // A category with that name may already exist: add the link to it
        const categoryName = pending.suggestedName;
        const isNewCategory = !linksData[categoryName];
        if (isNewCategory) {
            linksData[categoryName] = { description: '', color: pickCategoryColor(linksData), links: [] };
            // Add to the top of categoriesOrder (newest first)
            categoriesOrder.unshift(categoryName);
        }
        linksData[categoryName].links.unshift({
            url: url,
            description: title,
            done: false,
            timestamp: Date.now()
        });

        await chrome.storage.local.set({
            [STORAGE_KEY]: linksData,
            [ORDER_KEY]: categoriesOrder,
            dataLastModified: new Date().toISOString()
        });

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Link saved',
            message: isNewCategory ? `Saved to new category "${categoryName}"` : `Saved to "${categoryName}"`
        });
    } else if (info.menuItemId.startsWith('saveToCategory_')) {
        // Extract category name
        const categoryName = info.menuItemId.replace('saveToCategory_', '');

        // Add link at the top of the category (newest first)
        if (linksData[categoryName]) {
            linksData[categoryName].links.unshift({
                url: url,
                description: title,
                done: false,
                timestamp: Date.now()
            });

            await chrome.storage.local.set({
                [STORAGE_KEY]: linksData,
                dataLastModified: new Date().toISOString()
            });

            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'Link saved',
                message: `Saved to "${categoryName}"`
            })
        }
    }
});

// ============ SYNC (Google Sheet in the user's Drive) ============
//
// syncState = { userId, sheetId, cloudVersion, syncedLocalModified } records the last
// point where local data and the sheet were equal:
//   - local changed  = dataLastModified !== syncedLocalModified
//   - cloud changed  = the sheet's Drive version !== cloudVersion (also catches edits made in the sheet)
// Only the side that changed is copied. If both changed, the most recent edit wins.
// The first sync of a device, and the first sync after each sign-in (needsMerge), merges
// both sides instead, so links added while signed out are never lost.

// All sync operations run one at a time
let syncQueue = Promise.resolve();
function enqueue(task) {
    const run = syncQueue.then(task);
    syncQueue = run.catch(() => { });
    return run;
}

// Coalesce bursts of edits (e.g. drag & drop) into one pending sync
let syncPending = false;
function scheduleSync() {
    if (syncPending) return;
    syncPending = true;
    enqueue(async () => {
        syncPending = false;
        await syncLocalData(false);
    }).catch(error => console.error('Auto sync error:', error));
}

// Timestamp of the last data written by syncLocalData (not a user edit)
let lastSyncWrite = null;

async function syncLocalData(interactive) {
    const user = await googleAuth.getUser();
    if (!user) return;

    // Get a token first: an interactive sync may need to show the sign-in window
    await googleAuth.getAccessToken(interactive);

    const local = await chrome.storage.local.get([STORAGE_KEY, ORDER_KEY, 'dataLastModified', 'syncState']);
    const localData = local[STORAGE_KEY] || {};
    const localOrder = local[ORDER_KEY] || [];
    const state = local.syncState?.userId === user.userId ? local.syncState : null;
    const needsMerge = !state || !!state.needsMerge;

    const saveState = (sheet, syncedLocalModified) => chrome.storage.local.set({
        syncState: { userId: user.userId, sheetId: sheet.id, cloudVersion: sheet.version, syncedLocalModified }
    });

    const pushLocal = async (sheet) => {
        const uploaded = await sheetsSync.upload(sheet.id, localData, localOrder);
        await saveState(uploaded, local.dataLastModified);
    };

    const pullCloud = async (sheet, cloud) => {
        cloud = cloud || await sheetsSync.download(sheet.id);
        // The user edited something while we were downloading: keep the edit,
        // the sync scheduled by that edit will reconcile it
        const now = await chrome.storage.local.get('dataLastModified');
        if (now.dataLastModified !== local.dataLastModified) return;

        const timestamp = new Date().toISOString();
        lastSyncWrite = timestamp;
        await chrome.storage.local.set({
            [STORAGE_KEY]: cloud.data,
            [ORDER_KEY]: cloud.categoriesOrder,
            dataLastModified: timestamp
        });
        await saveState(sheet, timestamp);
    };

    // Use the sheet we already know by ID; search only on this device's first sync
    // or when that sheet is gone (another device may have created a new one)
    let sheet = state ? await sheetsSync.getSheet(state.sheetId) : null;
    if (!sheet) {
        sheet = await sheetsSync.findSheet();
    }

    if (!sheet) {
        if (!needsMerge && !interactive) {
            // The user deleted the sheet: don't silently bring it back
            throw new SheetDeletedError(
                'Your sync sheet was deleted from Google Drive. Click sync to create a new one, or sign out to stop syncing.'
            );
        }
        // First sync for this account, a fresh sign-in, or the user asked for a new sheet:
        // start it from local data
        sheet = await sheetsSync.createSheet();
        return pushLocal(sheet);
    }

    if (needsMerge) {
        // First sync of this device or after signing in: merge so neither side loses links
        const cloud = await sheetsSync.download(sheet.id);
        const merged = mergeData(cloud, localData, localOrder);
        if (merged.added > 0) {
            sheet = await sheetsSync.upload(sheet.id, merged.data, merged.categoriesOrder);
        }
        return pullCloud(sheet, merged);
    }

    const localChanged = local.dataLastModified !== state.syncedLocalModified;
    const cloudChanged = sheet.id !== state.sheetId || sheet.version !== state.cloudVersion;

    if (localChanged && cloudChanged) {
        // Both sides changed since the last sync: the most recent edit wins
        const localTime = Date.parse(local.dataLastModified) || 0;
        const cloudTime = Date.parse(sheet.modifiedTime) || 0;
        return localTime > cloudTime ? pushLocal(sheet) : pullCloud(sheet);
    }
    if (localChanged) return pushLocal(sheet);
    if (cloudChanged) return pullCloud(sheet);
}

// Key for comparing links while merging: http/https, host case and a trailing slash
// don't make the same page count as two different links
function urlKey(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.host + parsed.pathname.replace(/\/+$/, '') + parsed.search + parsed.hash;
        }
    } catch {
        // Not a valid absolute URL: compare as typed
    }
    return url.trim();
}

// Cloud data plus the local categories/links it doesn't have (links matched by urlKey).
// For a link on both sides the cloud version (description, done) is kept.
function mergeData(cloud, localData, localOrder) {
    const data = structuredClone(cloud.data);
    const categoriesOrder = [...cloud.categoriesOrder];
    let added = 0;

    for (const name of orderedCategories(localData, localOrder)) {
        const localLinks = localData[name].links || [];
        if (!data[name]) {
            data[name] = structuredClone(localData[name]);
            categoriesOrder.push(name);
            added += 1 + localLinks.length;
            continue;
        }
        const keys = new Set(data[name].links.map(link => urlKey(link.url)));
        for (const link of localLinks) {
            const key = urlKey(link.url);
            if (!keys.has(key)) {
                data[name].links.push(structuredClone(link));
                keys.add(key);
                added++;
            }
        }
    }

    return { data, categoriesOrder, added };
}

async function handleMessage(message) {
    switch (message.type) {
        case 'signIn':
            await googleAuth.signIn();
            // Sync in the background; the popup picks up the result via storage.onChanged
            enqueue(async () => {
                // Links may have been added on either side while signed out: merge, don't overwrite.
                // Keep the known sheet ID so a sheet Drive search hasn't indexed yet isn't duplicated.
                const { syncState } = await chrome.storage.local.get('syncState');
                if (syncState) {
                    await chrome.storage.local.set({ syncState: { ...syncState, needsMerge: true } });
                }
                await syncLocalData(false);
            }).catch(error => console.error('Sync after sign in error:', error));
            return;
        case 'signOut':
            return googleAuth.signOut();
        case 'sync':
            return enqueue(() => syncLocalData(!!message.interactive));
        default:
            throw new Error(`Unknown message type: ${message.type}`);
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message).then(
        () => sendResponse({ ok: true }),
        (error) => sendResponse({
            ok: false,
            error: error.message,
            // Errors the user has to act on (the popup shows them even for a background sync)
            userAction: error instanceof AuthRequiredError || error instanceof SheetDeletedError
        })
    );
    return true; // Keep the channel open for the async response
});
