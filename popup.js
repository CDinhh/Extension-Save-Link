// Storage key
const STORAGE_KEY = 'savedLinksData';
const ORDER_KEY = 'categoriesOrder';

// Data structure: { categoryName: { description: '', links: [{ url, description, done }, ...] } }
let linksData = {};
let categoriesOrder = []; // Track category order

// Track expanded categories
let expandedCategories = new Set();

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

// Public saveData function with auto-sync
async function saveData() {
    // Create timestamp once for consistency
    const timestamp = new Date().toISOString();

    // Save to local storage with timestamp
    try {
        await chrome.storage.local.set({
            [STORAGE_KEY]: linksData,
            [ORDER_KEY]: categoriesOrder,
            dataLastModified: timestamp
        });
    } catch (error) {
        console.error('Error saving data:', error);
        return;
    }

    // Auto sync if signed in
    const status = syncService.getStatus();
    if (status.isSignedIn && !status.isSyncing) {
        try {
            await syncService.uploadData(linksData, categoriesOrder, timestamp);
        } catch (error) {
            console.error('Auto sync error:', error);
        }
    }
}

// Add new category
async function addCategory(name, description) {
    if (!name || name.trim() === '') return;

    const trimmedName = name.trim();
    if (linksData[trimmedName]) {
        alert('This category already exists!');
        return;
    }
    linksData[trimmedName] = {
        description: description ? description.trim() : '',
        color: '#2196F3',
        links: []
    };

    // Add to categoriesOrder
    if (!categoriesOrder.includes(trimmedName)) {
        categoriesOrder.push(trimmedName);
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
        alert('This category name already exists!');
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
    }

    // Update description
    linksData[trimmedNewName].description = newDescription ? newDescription.trim() : '';

    await saveData();
    renderLinks();
}

// Save new link to category
async function saveLinkToCategory(category, url, description) {
    if (!url) {
        alert('Please enter URL!');
        return;
    }

    // Add link
    linksData[category].links.push({
        url: url.trim(),
        description: description.trim(),
        done: false,
        timestamp: Date.now()
    });

    await saveData();
    renderLinks();
}

// Open link in new tab
function openLink(url) {
    chrome.tabs.create({ url });
}

// Delete link
async function deleteLink(category, linkIndex) {
    if (!confirm('Are you sure you want to delete this link?')) return;

    linksData[category].links.splice(linkIndex, 1);

    // Remove category if empty
    if (linksData[category].links.length === 0) {
        delete linksData[category];
    }

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
            alert('Please enter URL!');
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
function renderLinks(searchTerm = '') {
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

        // Filter links by search term
        const filteredLinks = searchTerm
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

        filteredLinks.forEach((link, index) => {
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

            // Click URL to open (but not when focused for editing)
            const urlInput = linkItem.querySelector('.link-url-input');
            urlInput.addEventListener('click', (e) => {
                if (!e.target.matches(':focus')) {
                    openLink(link.url);
                }
            });

            // URL edit handler
            urlInput.addEventListener('blur', async (e) => {
                const newUrl = e.target.value.trim();
                if (newUrl && newUrl !== link.url) {
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
                        icon.className = 'fa-regular fa-copy';
                    }, 1000);
                } catch (error) {
                    alert('Failed to copy URL');
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
    if (!searchTerm) {
        initializeSortable();
    }
}

// Initialize Sortable.js for drag & drop
function initializeSortable() {
    const linksList = document.getElementById('linksList');

    // Enable drag & drop for categories
    if (linksList && typeof Sortable !== 'undefined') {
        const sortableInstance = new Sortable(linksList, {
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
            onEnd: async function (evt) {
                // Update categoriesOrder based on new DOM order
                categoriesOrder = Array.from(linksList.children)
                    .filter(div => div.classList.contains('category'))
                    .map(div => div.dataset.category);

                await saveData();
            }
        });
    }

    // Enable drag & drop for links within each category
    const categoryLinksElements = document.querySelectorAll('.category-links');

    categoryLinksElements.forEach((categoryLinksEl, index) => {
        const categoryDiv = categoryLinksEl.closest('.category');
        const category = categoryDiv?.dataset.category;

        if (!category || typeof Sortable === 'undefined') return;

        const linkSortable = new Sortable(categoryLinksEl, {
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

// Export Data Handler
document.getElementById('exportBtn').addEventListener('click', () => {
    const dataStr = JSON.stringify(linksData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `saved-links-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
});

// Import Data Handler
document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const importedData = JSON.parse(text);

        if (confirm('Import will replace all current data. Continue?')) {
            linksData = importedData;
            await saveData();
            renderLinks();
            alert('Data imported successfully!');
        }
    } catch (error) {
        alert('Error importing file: ' + error.message);
    }

    // Reset file input
    e.target.value = '';
});

// ============ SYNC FUNCTIONS ============

// Initialize sync service
async function initializeSync() {
    try {
        // Clear any stuck syncing states
        const syncBtn = document.getElementById('syncNowBtn');
        if (syncBtn) {
            syncBtn.classList.remove('syncing');
            syncBtn.disabled = false;
        }

        // Initialize sync service
        const isSignedIn = await syncService.init();

        if (isSignedIn) {
            updateSyncUI(syncService.getStatus());
        }

        // Add event listeners
        document.getElementById('signInBtn').addEventListener('click', handleSignIn);
        document.getElementById('signOutBtn').addEventListener('click', handleSignOut);
        document.getElementById('syncNowBtn').addEventListener('click', handleSyncNow);

    } catch (error) {
        console.error('Failed to initialize sync:', error);
    }
}

// Handle sign in
async function handleSignIn() {
    try {
        const signInBtn = document.getElementById('signInBtn');
        signInBtn.disabled = true;
        signInBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in...';

        const user = await syncService.signIn();

        // Sync data after sign in
        await handleSyncNow();

        updateSyncUI(syncService.getStatus());

        // Show success notification
        showNotification('Signed in successfully!', 'success');
    } catch (error) {
        console.error('Sign in error:', error);
        showNotification('Failed to sign in: ' + error.message, 'error');

        // Reset button
        const signInBtn = document.getElementById('signInBtn');
        signInBtn.disabled = false;
        signInBtn.innerHTML = '<i class="fa-brands fa-google"></i> Sign In';
    }
}

// Handle sign out
async function handleSignOut() {
    if (!confirm('Sign out from cloud sync?')) return;

    try {
        await syncService.signOut();
        updateSyncUI(syncService.getStatus());
        showNotification('Signed out successfully', 'success');
    } catch (error) {
        console.error('Sign out error:', error);
        showNotification('Failed to sign out: ' + error.message, 'error');
    }
}

// Handle sync now
async function handleSyncNow() {
    try {
        const syncBtn = document.getElementById('syncNowBtn');
        syncBtn.classList.add('syncing');
        syncBtn.disabled = true;

        // Sync current data with cloud
        const syncResult = await syncService.syncData(linksData, categoriesOrder);

        // Update local data with merged data
        linksData = syncResult.data;
        categoriesOrder = syncResult.categoriesOrder;
        await chrome.storage.local.set({
            [STORAGE_KEY]: linksData,
            [ORDER_KEY]: categoriesOrder
        });

        // Re-render
        renderLinks();

        showNotification('Synced successfully!', 'success');
    } catch (error) {
        console.error('Sync error:', error);
        showNotification('Failed to sync: ' + error.message, 'error');
    } finally {
        const syncBtn = document.getElementById('syncNowBtn');
        syncBtn.classList.remove('syncing');
        syncBtn.disabled = false;
    }
}

// Update sync UI
function updateSyncUI(status) {
    const signInBtn = document.getElementById('signInBtn');
    const userInfo = document.getElementById('userInfo');
    const userAvatar = document.getElementById('userAvatar');
    const userEmail = document.getElementById('userEmail');

    if (status.isSignedIn && status.user) {
        signInBtn.style.display = 'none';
        userInfo.style.display = 'flex';
        userAvatar.src = status.user.picture || 'icons/icon48.png';
        userEmail.textContent = status.user.email;
    } else {
        signInBtn.style.display = 'flex';
        userInfo.style.display = 'none';
    }
}

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

// saveData function already includes auto-sync functionality above

// Initialize
initializeSync();
loadData();
