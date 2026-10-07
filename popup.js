// Storage key
const STORAGE_KEY = 'savedLinksData';
const ORDER_KEY = 'categoriesOrder';

// Data structure: { categoryName: { description: '', links: [{ url, description, done }, ...] } }
let linksData = {};
let categoriesOrder = []; // Track category order

// Track expanded categories
let expandedCategories = new Set();

// Timestamp of the last save made by this popup (to ignore our own storage events)
let lastLocalWrite = null;

// Add https:// when the user typed a URL without a scheme (e.g. "google.com")
function normalizeUrl(url) {
    const trimmed = url.trim();
    if (!trimmed || /^([a-z][a-z0-9+.-]*:\/\/|mailto:|about:|data:)/i.test(trimmed)) return trimmed;
    return 'https://' + trimmed;
}

// Current text in the search box
function getSearchTerm() {
    return document.getElementById('searchInput').value;
}

// Load data from storage
async function loadData() {
    try {
        const result = await chrome.storage.local.get([STORAGE_KEY, ORDER_KEY]);
        linksData = result[STORAGE_KEY] || {};
        categoriesOrder = result[ORDER_KEY] || [];

        // Sync categoriesOrder with actual categories
        const actualCategories = Object.keys(linksData);
        categoriesOrder = categoriesOrder.filter(cat => actualCategories.includes(cat));
        actualCategories.forEach(cat => {
            if (!categoriesOrder.includes(cat)) {
                categoriesOrder.push(cat);
            }
        });

        renderLinks();
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Save to local storage. The background worker uploads it to the cloud when signed in,
// so the upload still finishes after the popup closes.
async function saveData() {
    const timestamp = new Date().toISOString();
    lastLocalWrite = timestamp;

    try {
        await chrome.storage.local.set({
            [STORAGE_KEY]: linksData,
            [ORDER_KEY]: categoriesOrder,
            dataLastModified: timestamp
        });
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

// Add new category
async function addCategory(name, description) {
    if (!name || name.trim() === '') return;

    const trimmedName = name.trim();
    if (linksData[trimmedName]) {
        alert('A category with this name already exists.');
        return;
    }
    linksData[trimmedName] = {
        description: description ? description.trim() : '',
        color: pickCategoryColor(linksData),
        links: []
    };

    // Add to the top of categoriesOrder (newest first)
    if (!categoriesOrder.includes(trimmedName)) {
        categoriesOrder.unshift(trimmedName);
    }

    await saveData();
    renderLinks();
}

// Update category (rename and/or update description)
async function updateCategory(oldName, newName, newDescription) {
    if (!newName || newName.trim() === '') return;

    const trimmedNewName = newName.trim();

    // If name changed, check if new name already exists
    if (oldName !== trimmedNewName && linksData[trimmedNewName]) {
        alert('A category with this name already exists.');
        renderLinks(); // Re-render to reset the input
        return;
    }

    // Update category
    if (oldName !== trimmedNewName) {
        // Rename category
        linksData[trimmedNewName] = linksData[oldName];
        delete linksData[oldName];

        // Update categoriesOrder
        const index = categoriesOrder.indexOf(oldName);
        if (index !== -1) {
            categoriesOrder[index] = trimmedNewName;
        }

        // Keep the category expanded under its new name
        if (expandedCategories.delete(oldName)) {
            expandedCategories.add(trimmedNewName);
        }
    }

    // Update description
    linksData[trimmedNewName].description = newDescription ? newDescription.trim() : '';

    await saveData();
    renderLinks();
}

// Save new link to category
async function saveLinkToCategory(category, url, description) {
    if (!url) {
        alert('Please enter a URL.');
        return;
    }

    // Add link at the top (newest first)
    linksData[category].links.unshift({
        url: normalizeUrl(url),
        description: description.trim(),
        done: false,
        timestamp: Date.now()
    });

    await saveData();
    renderLinks();
}

// Open link in new tab
function openLink(url) {
    chrome.tabs.create({ url: normalizeUrl(url) });
}

// Delete link (an emptied category is kept, like a newly created one)
async function deleteLink(category, linkIndex) {
    if (!confirm('Are you sure you want to delete this link?')) return;

    linksData[category].links.splice(linkIndex, 1);

    await saveData();
    renderLinks();
}

// Delete category
async function deleteCategory(category) {
    if (!confirm(`Are you sure you want to delete category "${category}" and all links inside?`)) return;

    delete linksData[category];

    // Remove from categoriesOrder
    const index = categoriesOrder.indexOf(category);
    if (index !== -1) {
        categoriesOrder.splice(index, 1);
    }

    await saveData();
    renderLinks();
}

// Toggle category collapse
function toggleCategory(categoryElement) {
    categoryElement.classList.toggle('collapsed');
    const categoryName = categoryElement.querySelector('.category-name-edit').value;

    if (categoryElement.classList.contains('collapsed')) {
        expandedCategories.delete(categoryName);
    } else {
        expandedCategories.add(categoryName);
    }
}

// Toggle link done status
async function toggleLinkDone(category, linkIndex) {
    linksData[category].links[linkIndex].done = !linksData[category].links[linkIndex].done;
    await saveData();
    renderLinks();
}

// Show add link form in category
function showAddLinkForm(category, categoryLinksElement, categoryDiv) {
    // Remove existing form if any
    const existingForm = categoryLinksElement.querySelector('.category-add-form');
    if (existingForm) {
        existingForm.remove();
        return;
    }

    // Expand category if collapsed
    if (categoryDiv.classList.contains('collapsed')) {
        categoryDiv.classList.remove('collapsed');
        expandedCategories.add(category);
    }

    // Create form
    const formDiv = document.createElement('div');
    formDiv.className = 'category-add-form';
    formDiv.innerHTML = `
        <input type="url" class="form-link-url" placeholder="https://example.com">
        <input type="text" class="form-link-description" placeholder="Description (optional)">
        <button class="btn-primary save-link-btn">Save</button>
    `;

    // Insert at top of category links
    categoryLinksElement.insertBefore(formDiv, categoryLinksElement.firstChild);

    // Focus on URL input
    formDiv.querySelector('.form-link-url').focus();

    // Add save handler
    formDiv.querySelector('.save-link-btn').addEventListener('click', async () => {
        const url = formDiv.querySelector('.form-link-url').value.trim();
        const description = formDiv.querySelector('.form-link-description').value.trim();

        if (url) {
            await saveLinkToCategory(category, url, description);
            formDiv.remove();
        } else {
            alert('Please enter a URL.');
        }
    });

    // Allow Enter to save
    formDiv.querySelector('.form-link-url').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            formDiv.querySelector('.save-link-btn').click();
        }
    });
}

// Render all links
function renderLinks(searchTerm = getSearchTerm()) {
    const linksList = document.getElementById('linksList');
    linksList.innerHTML = '';

    // Use categoriesOrder to maintain order
    const categories = categoriesOrder.filter(cat => linksData[cat]);

    // Show "No items" message if no categories exist
    if (categories.length === 0) {
        const noItemsDiv = document.createElement('div');
        noItemsDiv.className = 'no-items-message';
        noItemsDiv.textContent = 'No items';
        linksList.appendChild(noItemsDiv);
        return;
    }

    // Render categories
    categories.forEach(category => {
        const categoryData = linksData[category];
        const links = categoryData.links || [];

        const searchLower = searchTerm.toLowerCase();

        // Check if category matches search term
        const categoryMatches = searchTerm
            ? category.toLowerCase().includes(searchLower) ||
            (categoryData.description && categoryData.description.toLowerCase().includes(searchLower))
            : false;

        // Filter links by search term (a matching category shows all its links)
        const filteredLinks = searchTerm && !categoryMatches
            ? links.filter(link =>
                link.url.toLowerCase().includes(searchLower) ||
                (link.description && link.description.toLowerCase().includes(searchLower))
            )
            : links;

        // Skip category if neither category nor links match search
        if (searchTerm && !categoryMatches && filteredLinks.length === 0) return;

        // Create category element
        const categoryDiv = document.createElement('div');
        categoryDiv.className = expandedCategories.has(category) ? 'category' : 'category collapsed';
        categoryDiv.dataset.category = category; // For drag & drop

        // Set category color as CSS variable
        const categoryColor = categoryData.color || '#2196F3';
        categoryDiv.style.setProperty('--category-color', categoryColor);

        // Category header
        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'category-header';
        categoryHeader.innerHTML = `
            <i class="fa-solid fa-grip-vertical drag-handle" title="Drag to reorder"></i>
            <div class="category-info">
                <input type="color" class="category-color-picker" value="${categoryColor}" title="Choose category color">
                <input type="text" class="category-name-edit" value="${category}" data-original="${category}">
                <input type="text" class="category-desc-edit" value="${categoryData.description}" placeholder="Description">
                <span class="category-count">${filteredLinks.length}</span>
            </div>
            <div class="category-actions">
                <button class="btn-small add-link-btn" title="Add link"><i class="fa-solid fa-plus"></i></button>
                <button class="btn-small delete-category" title="Delete category"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;

        // Click to collapse/expand
        categoryHeader.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-category') &&
                !e.target.classList.contains('add-link-btn') &&
                !e.target.classList.contains('drag-handle') &&
                !e.target.classList.contains('category-name-edit') &&
                !e.target.classList.contains('category-desc-edit') &&
                !e.target.classList.contains('category-color-picker')) {
                toggleCategory(categoryDiv);
            }
        });

        // Category name edit handler
        const nameEditInput = categoryHeader.querySelector('.category-name-edit');
        nameEditInput.addEventListener('blur', async (e) => {
            const newName = e.target.value.trim();
            const oldName = e.target.dataset.original;
            const desc = categoryHeader.querySelector('.category-desc-edit').value.trim();

            if (newName && newName !== oldName) {
                await updateCategory(oldName, newName, desc);
                e.target.dataset.original = newName;
            } else if (!newName) {
                e.target.value = oldName; // Reset if empty
            }
        });

        nameEditInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.target.blur();
            }
        });

        // Category description edit handler
        const descEditInput = categoryHeader.querySelector('.category-desc-edit');
        descEditInput.addEventListener('blur', async (e) => {
            const newDesc = e.target.value.trim();
            const name = nameEditInput.value.trim();

            if (newDesc !== categoryData.description) {
                await updateCategory(category, name, newDesc);
            }
        });

        descEditInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.target.blur();
            }
        });

        // Category color picker handler
        const colorPicker = categoryHeader.querySelector('.category-color-picker');
        colorPicker.addEventListener('change', async (e) => {
            const newColor = e.target.value;
            linksData[category].color = newColor;
            categoryDiv.style.setProperty('--category-color', newColor);
            await saveData();
        });

        colorPicker.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Add link button
        categoryHeader.querySelector('.add-link-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            showAddLinkForm(category, categoryLinks, categoryDiv);
        });

        // Delete category button
        categoryHeader.querySelector('.delete-category').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteCategory(category);
        });

        categoryDiv.appendChild(categoryHeader);

        // Category links
        const categoryLinks = document.createElement('div');
        categoryLinks.className = 'category-links';

        if (filteredLinks.length === 0 && !searchTerm) {
            // Show empty state message when no links in category
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-category-message';
            emptyMessage.textContent = 'No link yet, please add new';
            categoryLinks.appendChild(emptyMessage);
        }

        filteredLinks.forEach((link) => {
            const originalIndex = links.indexOf(link);
            const linkItem = document.createElement('div');
            linkItem.className = `link-item ${link.done ? 'done' : ''}`;
            linkItem.dataset.linkIndex = originalIndex; // For drag & drop
            linkItem.dataset.category = category; // For drag & drop

            linkItem.innerHTML = `
                <div class="link-content">
                    <i class="fa-solid fa-grip-vertical drag-handle-link" title="Drag to reorder"></i>
                    <input type="checkbox" class="link-checkbox" ${link.done ? 'checked' : ''}>
                    <input type="url" class="link-url-input" value="${link.url}" title="${link.url}" placeholder="URL">
                    <input type="text" class="link-desc-input" value="${link.description}" title="${link.description}"  placeholder="Description">
                    <div class="link-actions">
                        <button class="btn-small open-link" title="Open in new tab"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
                        <button class="btn-small copy-link" title="Copy URL"><i class="fa-solid fa-copy"></i></button>
                        <button class="btn-small delete-link" title="Delete"><i class="fa-solid fa-delete-left"></i></button>
                    </div>
                </div>
            `;

            // Checkbox handler
            linkItem.querySelector('.link-checkbox').addEventListener('change', (e) => {
                e.stopPropagation();
                toggleLinkDone(category, originalIndex);
            });

            // URL edit handler
            const urlInput = linkItem.querySelector('.link-url-input');
            urlInput.addEventListener('blur', async (e) => {
                const newUrl = normalizeUrl(e.target.value);
                if (newUrl && newUrl !== link.url) {
                    e.target.value = newUrl;
                    linksData[category].links[originalIndex].url = newUrl;
                    await saveData();
                } else if (!newUrl) {
                    e.target.value = link.url; // Reset if empty
                }
            });

            urlInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.target.blur();
                }
            });

            // Description edit handler
            const descInput = linkItem.querySelector('.link-desc-input');
            descInput.addEventListener('blur', async (e) => {
                const newDesc = e.target.value.trim();
                if (newDesc !== link.description) {
                    linksData[category].links[originalIndex].description = newDesc;
                    await saveData();
                }
            });

            descInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.target.blur();
                }
            });

            // Open link button
            linkItem.querySelector('.open-link').addEventListener('click', () => {
                openLink(link.url);
            });

            // Copy link button
            linkItem.querySelector('.copy-link').addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(link.url);
                    const btn = linkItem.querySelector('.copy-link');
                    const icon = btn.querySelector('i');
                    icon.className = 'fa-solid fa-check';
                    setTimeout(() => {
                        icon.className = 'fa-solid fa-copy';
                    }, 1000);
                } catch (error) {
                    alert('Could not copy the URL.');
                }
            });

            // Delete link button
            linkItem.querySelector('.delete-link').addEventListener('click', () => {
                deleteLink(category, originalIndex);
            });

            categoryLinks.appendChild(linkItem);
        });

        categoryDiv.appendChild(categoryLinks);
        linksList.appendChild(categoryDiv);
    });

    // Initialize drag & drop after rendering
    initializeSortable(!!searchTerm);
}

// Initialize Sortable.js for drag & drop.
// Disabled while searching: hidden categories/links would be dropped from the saved order.
function initializeSortable(isSearching) {
    const linksList = document.getElementById('linksList');

    // Enable drag & drop for categories. #linksList survives re-renders,
    // so create its Sortable only once instead of stacking a new one each render.
    const existingSortable = typeof Sortable !== 'undefined' && Sortable.get(linksList);
    if (existingSortable) {
        existingSortable.option('disabled', isSearching);
    } else if (linksList && typeof Sortable !== 'undefined') {
        new Sortable(linksList, {
            disabled: isSearching,
            animation: 200,
            handle: '.drag-handle',
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            filter: '.category-add-form',
            preventOnFilter: false,
            scroll: true,
            forceAutoScrollFallback: true,
            scrollSensitivity: 100,
            scrollSpeed: 20,
            bubbleScroll: true,
            onEnd: async function () {
                // Update categoriesOrder based on new DOM order
                categoriesOrder = Array.from(linksList.children)
                    .filter(div => div.classList.contains('category'))
                    .map(div => div.dataset.category);

                await saveData();
            }
        });
    }

    if (isSearching) return;

    // Enable drag & drop for links within each category
    const categoryLinksElements = document.querySelectorAll('.category-links');

    categoryLinksElements.forEach((categoryLinksEl) => {
        const categoryDiv = categoryLinksEl.closest('.category');
        const category = categoryDiv?.dataset.category;

        if (!category || typeof Sortable === 'undefined') return;

        new Sortable(categoryLinksEl, {
            animation: 200,
            handle: '.drag-handle-link',
            group: 'shared-links',
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            filter: '.category-add-form',
            preventOnFilter: false,
            scroll: true,
            forceAutoScrollFallback: true,
            scrollSensitivity: 100,
            scrollSpeed: 20,
            bubbleScroll: true,
            onEnd: async function (evt) {
                // Check if moved to different category
                const fromCategory = evt.from.closest('.category')?.dataset.category;
                const toCategory = evt.to.closest('.category')?.dataset.category;

                if (fromCategory && toCategory) {
                    if (fromCategory !== toCategory) {
                        // Moved to different category
                        const movedLinkElement = evt.item;
                        const oldLinkIndex = parseInt(movedLinkElement.dataset.linkIndex);
                        const movedLink = linksData[fromCategory].links[oldLinkIndex];

                        if (movedLink) {
                            // Remove from old category
                            linksData[fromCategory].links = linksData[fromCategory].links.filter((_, idx) => idx !== oldLinkIndex);

                            // Get new order in target category
                            const targetLinkItems = Array.from(evt.to.querySelectorAll('.link-item'));
                            const newIndex = targetLinkItems.indexOf(movedLinkElement);

                            // Insert into new category at correct position
                            linksData[toCategory].links.splice(newIndex, 0, movedLink);
                        }
                    } else {
                        // Reordered within same category
                        const linkItems = Array.from(categoryLinksEl.querySelectorAll('.link-item'));
                        const reorderedLinks = linkItems
                            .map(item => {
                                const linkIndex = parseInt(item.dataset.linkIndex);
                                return linksData[category].links[linkIndex];
                            })
                            .filter(link => link);

                        linksData[category].links = reorderedLinks;
                    }

                    await saveData();
                    renderLinks(); // Re-render to update indices
                }
            }
        });
    });
}

// Search functionality
let searchTimeout;
document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        renderLinks(e.target.value);
    }, 300);
});

// Add Category Button Handler
document.getElementById('addCategoryBtn').addEventListener('click', () => {
    const name = prompt('Category name:');
    if (!name) return;

    const description = prompt('Category description (optional):');
    addCategory(name, description || '');
});

// Export Data Handler (includes category order so it survives a round trip)
document.getElementById('exportBtn').addEventListener('click', () => {
    const dataStr = JSON.stringify({ data: linksData, categoriesOrder }, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `saved-links-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
});

// Validate an imported file and return { data, order }.
// Accepts the current export format { data, categoriesOrder } and the old one { categoryName: {...} }.
function parseImportedData(json) {
    const isWrapped = json && typeof json.data === 'object' && Array.isArray(json.categoriesOrder);
    const raw = isWrapped ? json.data : json;

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Invalid file format');
    }

    const data = {};
    for (const [name, category] of Object.entries(raw)) {
        if (!category || !Array.isArray(category.links)) {
            throw new Error(`Category "${name}" has no links list`);
        }
        data[name] = {
            description: typeof category.description === 'string' ? category.description : '',
            color: typeof category.color === 'string' ? category.color : '#2196F3',
            links: category.links
                .filter(link => link && typeof link.url === 'string')
                .map(link => ({
                    url: link.url,
                    description: typeof link.description === 'string' ? link.description : '',
                    done: !!link.done,
                    timestamp: link.timestamp || Date.now()
                }))
        };
    }

    const order = isWrapped ? json.categoriesOrder.filter(cat => data[cat]) : [];
    Object.keys(data).forEach(cat => {
        if (!order.includes(cat)) order.push(cat);
    });

    return { data, order };
}

// Import Data Handler
document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const { data, order } = parseImportedData(JSON.parse(text));

        if (confirm('Import will replace all current data. Continue?')) {
            linksData = data;
            categoriesOrder = order;
            await saveData();
            renderLinks();
            alert('Data imported.');
        }
    } catch (error) {
        alert('Could not import file: ' + error.message);
    }

    // Reset file input
    e.target.value = '';
});

// ============ SYNC FUNCTIONS ============
// Links are synced to a Google Sheet in the user's own Google Drive.
// Sign in and sync run in the background worker so they survive the popup closing
// (the Google sign-in window steals focus and usually closes the popup).

async function sendToBackground(type, extra = {}) {
    const response = await chrome.runtime.sendMessage({ type, ...extra });
    if (!response || !response.ok) {
        const error = new Error(response?.error || 'No response from background');
        error.userAction = !!response?.userAction;
        throw error;
    }
}

// Initialize sync UI, then pull changes made on other devices or in the sheet
async function initializeSync() {
    document.getElementById('signInBtn').addEventListener('click', handleSignIn);
    document.getElementById('signOutBtn').addEventListener('click', handleSignOut);
    document.getElementById('syncNowBtn').addEventListener('click', handleSyncNow);
    document.getElementById('openSheetBtn').addEventListener('click', handleOpenSheet);

    try {
        const { googleUser, syncState } = await chrome.storage.local.get(['googleUser', 'syncState']);
        updateSyncUI(googleUser, syncState);

        if (googleUser) {
            // Silent: never pops up a sign-in window on its own
            await sendToBackground('sync', { interactive: false });
        }
    } catch (error) {
        console.error('Sync on open failed:', error);
        if (error.userAction) {
            showNotification(error.message, 'error');
        }
    }
}

// Handle sign in
async function handleSignIn() {
    const signInBtn = document.getElementById('signInBtn');
    signInBtn.disabled = true;
    signInBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in...';

    try {
        // UI switches to signed-in via the googleUser storage change
        await sendToBackground('signIn');
        showNotification('Signed in', 'success');
    } catch (error) {
        console.error('Sign in error:', error);
        showNotification('Sign-in failed: ' + error.message, 'error');
    } finally {
        resetSignInButton();
    }
}

function resetSignInButton() {
    const signInBtn = document.getElementById('signInBtn');
    signInBtn.disabled = false;
    signInBtn.innerHTML = '<i class="fa-brands fa-google"></i> Sign In';
}

// Handle sign out
async function handleSignOut() {
    if (!confirm('Sign out from cloud sync?')) return;

    try {
        await sendToBackground('signOut');
        showNotification('Signed out', 'success');
    } catch (error) {
        console.error('Sign out error:', error);
        showNotification('Sign-out failed: ' + error.message, 'error');
    }
}

// Handle sync now (may show the Google sign-in window if the session expired)
async function handleSyncNow() {
    const syncBtn = document.getElementById('syncNowBtn');
    syncBtn.classList.add('syncing');
    syncBtn.disabled = true;

    try {
        await sendToBackground('sync', { interactive: true });
        await loadData();
        showNotification('Sync complete', 'success');
    } catch (error) {
        console.error('Sync error:', error);
        showNotification('Sync failed: ' + error.message, 'error');
    } finally {
        syncBtn.classList.remove('syncing');
        syncBtn.disabled = false;
    }
}

// Open the user's Google Sheet
async function handleOpenSheet() {
    const { syncState } = await chrome.storage.local.get('syncState');
    if (syncState?.sheetId) {
        chrome.tabs.create({ url: `https://docs.google.com/spreadsheets/d/${syncState.sheetId}/edit` });
    }
}

// Update sync UI
function updateSyncUI(user, syncState) {
    const signInBtn = document.getElementById('signInBtn');
    const userInfo = document.getElementById('userInfo');
    const userAvatar = document.getElementById('userAvatar');
    const userEmail = document.getElementById('userEmail');
    const openSheetBtn = document.getElementById('openSheetBtn');

    if (user) {
        signInBtn.style.display = 'none';
        userInfo.style.display = 'flex';
        userAvatar.src = user.picture || 'icons/icon48.png';
        userEmail.textContent = user.email;
        const hasSheet = syncState?.userId === user.userId && syncState.sheetId;
        openSheetBtn.style.display = hasSheet ? '' : 'none';
    } else {
        resetSignInButton();
        signInBtn.style.display = 'flex';
        userInfo.style.display = 'none';
    }
}

// React to changes made outside this popup (background sync, context menu, sign in/out)
chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace !== 'local') return;

    if (changes.googleUser || changes.syncState) {
        const { googleUser, syncState } = await chrome.storage.local.get(['googleUser', 'syncState']);
        updateSyncUI(googleUser, syncState);
    }

    const modified = changes.dataLastModified;
    if (modified && modified.newValue !== lastLocalWrite) {
        loadData();
    }
});

// The popup can close without firing blur on the field being edited: commit it now.
// The blur handlers call chrome.storage.local.set synchronously, so the write is sent.
window.addEventListener('pagehide', () => {
    if (document.activeElement instanceof HTMLInputElement) {
        document.activeElement.blur();
    }
});

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#34a853' : type === 'error' ? '#ea4335' : '#4285f4'};
        color: white;
        border-radius: 6px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// "+ New category" from the right-click menu opens the popup: ask for the category name,
// prefilled with the site's domain
async function showPendingSave() {
    let pending;
    try {
        ({ pendingNewCategory: pending } = await chrome.storage.session.get('pendingNewCategory'));
        if (!pending) return;
        await chrome.storage.session.remove('pendingNewCategory');
    } catch (error) {
        console.error('Could not read pending save:', error);
        return;
    }

    const container = document.getElementById('pendingSave');
    const form = document.createElement('div');
    form.className = 'category-add-form pending-save-form';

    const label = document.createElement('div');
    label.className = 'pending-save-title';
    label.textContent = `Save "${pending.title || pending.url}" to new category:`;
    label.title = pending.url;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Category name';
    nameInput.value = pending.suggestedName;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-primary save-link-btn';
    saveBtn.textContent = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'save-link-btn';
    cancelBtn.textContent = 'Cancel';

    form.append(label, nameInput, saveBtn, cancelBtn);
    container.replaceChildren(form);
    nameInput.focus();
    nameInput.select();

    saveBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) {
            nameInput.focus();
            return;
        }
        await saveLinkToNewCategory(name, pending);
        container.replaceChildren();
        showNotification(`Saved to "${name}"`, 'success');
    });

    cancelBtn.addEventListener('click', () => container.replaceChildren());

    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveBtn.click();
    });
}

// Create the category (or reuse one with the same name) with the link at the top
async function saveLinkToNewCategory(name, pending) {
    if (!linksData[name]) {
        linksData[name] = { description: '', color: pickCategoryColor(linksData), links: [] };
        categoriesOrder.unshift(name);
    }
    linksData[name].links.unshift({
        url: pending.url,
        description: pending.title || '',
        done: false,
        timestamp: Date.now()
    });
    expandedCategories.add(name);

    await saveData();
    renderLinks();
}

// Initialize
// Focus search on open (autofocus alone is not always honored in extension popups)
document.getElementById('searchInput').focus();
initializeSync();
loadData().then(showPendingSave);
