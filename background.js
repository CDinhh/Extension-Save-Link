// Storage key
const STORAGE_KEY = 'savedLinksData';
const ORDER_KEY = 'categoriesOrder';

// Create context menu when extension is installed
chrome.runtime.onInstalled.addListener(async () => {
    await updateContextMenu();
});

// Update context menu when storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes[STORAGE_KEY]) {
        updateContextMenu();
    }
});

// Function to update context menu with current categories
async function updateContextMenu() {
    // Remove all existing context menus
    await chrome.contextMenus.removeAll();

    // Get current data
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const linksData = result[STORAGE_KEY] || {};
    const categories = Object.keys(linksData);

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

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const url = tab.url;
    const title = tab.title;

    // Get existing data
    const result = await chrome.storage.local.get([STORAGE_KEY, ORDER_KEY]);
    const linksData = result[STORAGE_KEY] || {};
    const categoriesOrder = result[ORDER_KEY] || [];

    if (info.menuItemId === 'saveLinkToNew') {
        // Create new category
        const categoryName = 'Quick Save ' + new Date().toLocaleString();
        linksData[categoryName] = {
            description: '',
            color: '#2196F3',
            links: [{
                url: url,
                description: title,
                done: false,
                timestamp: Date.now()
            }]
        };

        // Add to categoriesOrder
        if (!categoriesOrder.includes(categoryName)) {
            categoriesOrder.push(categoryName);
        }

        await chrome.storage.local.set({
            [STORAGE_KEY]: linksData,
            [ORDER_KEY]: categoriesOrder,
            dataLastModified: new Date().toISOString()
        });

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Link Saved',
            message: `Saved to new category "${categoryName}"`
        });
    } else if (info.menuItemId.startsWith('saveToCategory_')) {
        // Extract category name
        const categoryName = info.menuItemId.replace('saveToCategory_', '');

        // Add link to category
        if (linksData[categoryName]) {
            linksData[categoryName].links.push({
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
                title: 'Link Saved',
                message: `Saved to "${categoryName}"`
            })
        }
    }
});
