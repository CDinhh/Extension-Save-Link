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

// Page titles and synced sheet cells are untrusted: escape anything placed in an innerHTML template
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
}

// Short address shown under a link's title
function displayUrl(url) {
    try {
        const { hostname, pathname } = new URL(normalizeUrl(url));
        if (hostname) return hostname.replace(/^www\./, '') + (pathname === '/' ? '' : pathname);
    } catch {
        // Not a parsable URL: show it as it is
    }
    return url;
}

// A link's title falls back to its site name
function linkTitle(link) {
    return link.description || displayUrl(link.url).split('/')[0];
}

// Inline SVG from the bundled Phosphor Light sprite
function icon(name, extraClass = '') {
    return `<svg class="icon ${extraClass}" aria-hidden="true"><use href="icons/phosphor-light.svg#${name}"></use></svg>`;
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
        showNotification(t('categoryExists'), 'error');
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
    expandedCategories.add(trimmedName); // Ready for its first link

    await saveData();
    renderLinks();
}

// Update category (rename and/or update description)
async function updateCategory(oldName, newName, newDescription) {
    if (!newName || newName.trim() === '') return;

    const trimmedNewName = newName.trim();

    // If name changed, check if new name already exists
    if (oldName !== trimmedNewName && linksData[trimmedNewName]) {
        showNotification(t('categoryExists'), 'error');
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
        showNotification(t('enterUrl'), 'error');
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
function openLink(url, active = true) {
    chrome.tabs.create({ url: normalizeUrl(url), active });
}

// Delete link right away with an Undo (an emptied category is kept, like a newly created one)
async function deleteLink(category, linkIndex) {
    const [removed] = linksData[category].links.splice(linkIndex, 1);

    await saveData();
    renderLinks();

    showNotification(t('linkDeleted'), 'info', {
        label: t('undo'),
        run: async () => {
            if (!linksData[category]) return;
            linksData[category].links.splice(linkIndex, 0, removed);
            await saveData();
            renderLinks();
        }
    });
}

// Delete category
async function deleteCategory(category) {
    const count = linksData[category].links.length;
    const confirmed = await openDialog({
        title: t('deleteCategoryTitle', { name: category }),
        message: t(count === 0 ? 'deleteCategoryEmpty' : count === 1 ? 'deleteCategoryOne' : 'deleteCategoryMany', { count }),
        confirmLabel: t('delete'),
        danger: true
    });
    if (!confirmed) return;

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
    const collapsed = categoryElement.classList.toggle('collapsed');
    const categoryName = categoryElement.dataset.category;
    categoryElement.querySelector('.category-header').setAttribute('aria-expanded', String(!collapsed));

    if (collapsed) {
        expandedCategories.delete(categoryName);
    } else {
        expandedCategories.add(categoryName);
    }
}

// Toggle link done status in place, so the row keeps its position and animation
async function toggleLinkDone(category, linkIndex, linkItem) {
    const link = linksData[category].links[linkIndex];
    link.done = !link.done;
    linkItem.classList.toggle('done', link.done);
    await saveData();
}

// Escape cancels an edit instead of closing the popup
function onEscape(input, action) {
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            action();
        }
    });
}

function createTextInput(className, placeholder, value = '') {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = `text-input ${className}`;
    input.placeholder = placeholder;
    input.value = value;
    return input;
}

// The tab the popup was opened on. activeTab exposes its URL only after the toolbar click.
async function getCurrentPage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab?.url && /^https?:/.test(tab.url) ? tab : null;
    } catch {
        return null;
    }
}

// Show add link form in category, prefilled with the current page
async function showAddLinkForm(category, categoryLinksElement, categoryDiv) {
    // Remove existing form if any
    const existingForm = categoryLinksElement.querySelector('.category-add-form');
    if (existingForm) {
        existingForm.remove();
        return;
    }

    // Expand category if collapsed
    if (categoryDiv.classList.contains('collapsed')) {
        toggleCategory(categoryDiv);
    }

    const urlInput = createTextInput('form-link-url', 'https://example.com');
    const descInput = createTextInput('form-link-description', t('titleOptional'));
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-primary save-link-btn';
    saveBtn.textContent = t('saveLink');
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-plain';
    cancelBtn.textContent = t('cancel');
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    actions.append(cancelBtn, saveBtn);

    const formDiv = document.createElement('div');
    formDiv.className = 'category-add-form';
    formDiv.append(urlInput, descInput, actions);
    categoryLinksElement.insertBefore(formDiv, categoryLinksElement.firstChild);
    urlInput.focus();

    const save = async () => {
        const url = urlInput.value.trim();
        if (!url) {
            showNotification(t('enterUrl'), 'error');
            urlInput.focus();
            return;
        }
        await saveLinkToCategory(category, url, descInput.value);
    };

    saveBtn.addEventListener('click', save);
    cancelBtn.addEventListener('click', () => formDiv.remove());
    for (const input of [urlInput, descInput]) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') save();
        });
        onEscape(input, () => formDiv.remove());
    }

    const page = await getCurrentPage();
    if (page && !urlInput.value) {
        urlInput.value = page.url;
        descInput.value = page.title || '';
        urlInput.select();
    }
}

// Swap the category name for inputs. Both are committed together when focus leaves them.
function startCategoryEdit(categoryHeader, category) {
    const data = linksData[category];
    const nameInput = createTextInput('category-name-edit', t('categoryName'), category);
    const descInput = createTextInput('category-desc-edit', t('description'), data.description);
    const editor = document.createElement('div');
    editor.className = 'category-editor';
    editor.append(nameInput, descInput);
    categoryHeader.querySelector('.category-text').replaceWith(editor);
    nameInput.focus();
    nameInput.select();

    editor.addEventListener('focusout', (e) => {
        if (editor.contains(e.relatedTarget)) return;
        const name = nameInput.value.trim() || category;
        const description = descInput.value.trim();
        if (name !== category || description !== (data.description || '')) {
            updateCategory(category, name, description);
        } else {
            renderLinks();
        }
    });

    for (const input of [nameInput, descInput]) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
        });
        onEscape(input, () => {
            nameInput.value = category;
            descInput.value = data.description || '';
            input.blur();
        });
    }
}

// Swap the link's title and address for inputs. Committed when focus leaves them.
function startLinkEdit(linkItem, category, linkIndex) {
    const link = linksData[category].links[linkIndex];
    const descInput = createTextInput('link-desc-input', t('title'), link.description);
    const urlInput = createTextInput('link-url-input', 'https://example.com', link.url);
    const editor = document.createElement('div');
    editor.className = 'link-editor';
    editor.append(descInput, urlInput);
    linkItem.querySelector('.link-main').replaceWith(editor);
    linkItem.querySelector('.link-actions').remove();
    descInput.focus();
    descInput.select();

    editor.addEventListener('focusout', (e) => {
        if (editor.contains(e.relatedTarget)) return;
        link.url = normalizeUrl(urlInput.value) || link.url;
        link.description = descInput.value.trim();
        saveData();
        renderLinks();
    });

    for (const input of [descInput, urlInput]) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
        });
        onEscape(input, () => {
            urlInput.value = link.url;
            descInput.value = link.description || '';
            input.blur();
        });
    }
}

// Render all links
function renderLinks(searchTerm = getSearchTerm()) {
    const linksList = document.getElementById('linksList');
    const scrollTop = linksList.scrollTop; // Re-rendering must not jump the list back to the top
    linksList.innerHTML = '';

    // Use categoriesOrder to maintain order
    const categories = categoriesOrder.filter(cat => linksData[cat]);

    // First-run screen
    if (categories.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `
            <img src="icons/icon128.png" alt="">
            <h2>${escapeHtml(t('emptyTitle'))}</h2>
            <p>${escapeHtml(t('emptyText'))}</p>
            <button class="btn-primary">${icon('plus')} ${escapeHtml(t('newCategory'))}</button>
        `;
        empty.querySelector('button').addEventListener('click', promptNewCategory);
        linksList.appendChild(empty);
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

        // Results must be visible while searching, even in a collapsed category
        const expanded = expandedCategories.has(category) || !!searchTerm;

        // Create category element
        const categoryDiv = document.createElement('div');
        categoryDiv.className = expanded ? 'category' : 'category collapsed';
        categoryDiv.dataset.category = category; // For drag & drop

        // Set category color as CSS variable
        const categoryColor = categoryData.color || '#2196F3';
        categoryDiv.style.setProperty('--category-color', categoryColor);

        // Category header
        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'category-header';
        categoryHeader.tabIndex = 0;
        categoryHeader.setAttribute('role', 'button');
        categoryHeader.setAttribute('aria-expanded', String(expanded));
        categoryHeader.innerHTML = `
            <input type="color" class="category-color-picker" value="${escapeHtml(categoryColor)}" title="${escapeHtml(t('changeColor'))}" aria-label="${escapeHtml(t('categoryColor'))}">
            <div class="category-text">
                <span class="category-name" title="${escapeHtml(category)}">${escapeHtml(category)}</span>
                ${categoryData.description ? `<span class="category-desc" title="${escapeHtml(categoryData.description)}">${escapeHtml(categoryData.description)}</span>` : ''}
            </div>
            <span class="category-count">${filteredLinks.length}</span>
            <div class="category-actions">
                <button class="btn-small edit-category" title="${escapeHtml(t('editCategory'))}" aria-label="${escapeHtml(t('editCategory'))}">${icon('pencil-simple')}</button>
                <button class="btn-small delete-category" title="${escapeHtml(t('deleteCategory'))}" aria-label="${escapeHtml(t('deleteCategory'))}">${icon('trash')}</button>
                <button class="btn-small add-link-btn" title="${escapeHtml(t('addLink'))}" aria-label="${escapeHtml(t('addLink'))}">${icon('plus')}</button>
            </div>
            <span class="chevron">${icon('caret-right')}</span>
        `;

        // Click to collapse/expand
        categoryHeader.addEventListener('click', (e) => {
            if (!e.target.closest('.category-actions, .category-color-picker, .category-editor')) {
                toggleCategory(categoryDiv);
            }
        });

        categoryHeader.addEventListener('keydown', (e) => {
            if (e.target === categoryHeader && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                toggleCategory(categoryDiv);
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

        // Add link button
        categoryHeader.querySelector('.add-link-btn').addEventListener('click', () => {
            showAddLinkForm(category, categoryLinks, categoryDiv);
        });

        // Edit category button
        categoryHeader.querySelector('.edit-category').addEventListener('click', () => {
            startCategoryEdit(categoryHeader, category);
        });

        // Delete category button
        categoryHeader.querySelector('.delete-category').addEventListener('click', () => {
            deleteCategory(category);
        });

        categoryDiv.appendChild(categoryHeader);

        // Category links
        const categoryBody = document.createElement('div');
        categoryBody.className = 'category-body';
        const categoryLinks = document.createElement('div');
        categoryLinks.className = 'category-links';

        if (filteredLinks.length === 0 && !searchTerm) {
            // Show empty state message when no links in category
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-category-message';
            emptyMessage.textContent = t('emptyCategory');
            categoryLinks.appendChild(emptyMessage);
        }

        filteredLinks.forEach((link) => {
            const originalIndex = links.indexOf(link);
            const linkItem = document.createElement('div');
            linkItem.className = `link-item ${link.done ? 'done' : ''}`;
            linkItem.dataset.linkIndex = originalIndex; // For drag & drop
            linkItem.dataset.category = category; // For drag & drop
            linkItem.style.setProperty('--c', categoryColor); // Keeps its colour when lifted onto <body>

            linkItem.innerHTML = `
                <input type="checkbox" class="link-checkbox" aria-label="${escapeHtml(t('markDone'))}" ${link.done ? 'checked' : ''}>
                <a class="link-main" href="${escapeHtml(normalizeUrl(link.url))}" title="${escapeHtml(link.url)}">
                    <span class="link-title">${escapeHtml(linkTitle(link))}</span>
                    <span class="link-url">${escapeHtml(displayUrl(link.url))}</span>
                </a>
                <div class="link-actions">
                    <button class="btn-small edit-link" title="${escapeHtml(t('edit'))}" aria-label="${escapeHtml(t('editLink'))}">${icon('pencil-simple')}</button>
                    <button class="btn-small copy-link" title="${escapeHtml(t('copyUrl'))}" aria-label="${escapeHtml(t('copyUrl'))}">${icon('copy')}</button>
                    <button class="btn-small delete-link" title="${escapeHtml(t('delete'))}" aria-label="${escapeHtml(t('deleteLink'))}">${icon('trash')}</button>
                </div>
            `;

            // Checkbox handler
            linkItem.querySelector('.link-checkbox').addEventListener('change', () => {
                toggleLinkDone(category, originalIndex, linkItem);
            });

            // Open in a new tab. Ctrl/Cmd-click or middle-click keeps the popup open.
            const linkMain = linkItem.querySelector('.link-main');
            linkMain.addEventListener('click', (e) => {
                e.preventDefault();
                openLink(link.url, !(e.ctrlKey || e.metaKey));
            });
            linkMain.addEventListener('auxclick', (e) => {
                e.preventDefault();
                if (e.button === 1) openLink(link.url, false);
            });

            // Edit link button
            linkItem.querySelector('.edit-link').addEventListener('click', () => {
                startLinkEdit(linkItem, category, originalIndex);
            });

            // Copy link button
            linkItem.querySelector('.copy-link').addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(link.url);
                    const copyBtn = linkItem.querySelector('.copy-link');
                    copyBtn.innerHTML = icon('check');
                    setTimeout(() => {
                        copyBtn.innerHTML = icon('copy');
                    }, 1000);
                } catch (error) {
                    showNotification(t('copyFailed'), 'error');
                }
            });

            // Delete link button
            linkItem.querySelector('.delete-link').addEventListener('click', () => {
                deleteLink(category, originalIndex);
            });

            categoryLinks.appendChild(linkItem);
        });

        categoryBody.appendChild(categoryLinks);
        categoryDiv.appendChild(categoryBody);
        linksList.appendChild(categoryDiv);
    });

    if (searchTerm && linksList.children.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'no-results';
        noResults.textContent = t('noResults', { term: searchTerm });
        linksList.appendChild(noResults);
    }

    linksList.scrollTop = scrollTop;

    // Initialize drag & drop after rendering
    initializeSortable(!!searchTerm);
}

// Drag & drop uses Sortable's pointer-based fallback: native HTML5 drag goes through the OS drag loop,
// which is unreliable inside extension popups. Disabled while searching, because hidden categories
// and links would be dropped from the saved order.
const SORTABLE_COMMON = {
    forceFallback: true,
    fallbackTolerance: 4, // a click that wobbles a few pixels is still a click
    animation: 200,
    easing: 'cubic-bezier(.32, .72, 0, 1)',
    ghostClass: 'drag-placeholder',
    chosenClass: 'drag-chosen',
    fallbackClass: 'drag-lifted',
    preventOnFilter: false,
    scroll: true,
    scrollSensitivity: 60,
    scrollSpeed: 14,
    bubbleScroll: true,
};

// While a link is dragged, hovering a collapsed category's header for a moment opens it
const HOVER_EXPAND_MS = 500;
let hoverExpandTimer = null;
let hoverExpandTarget = null;

function categoryHeaderAt(x, y) {
    return document.elementFromPoint(x, y)?.closest('.category-header') || null;
}

function expandOnHover(event) {
    const header = categoryHeaderAt(event.clientX, event.clientY);
    const categoryDiv = header?.closest('.category.collapsed') || null;
    if (categoryDiv === hoverExpandTarget) return;
    clearTimeout(hoverExpandTimer);
    hoverExpandTarget = categoryDiv;
    if (categoryDiv) {
        hoverExpandTimer = setTimeout(() => {
            if (categoryDiv.classList.contains('collapsed')) toggleCategory(categoryDiv);
        }, HOVER_EXPAND_MS);
    }
}

// Outline the category a dragged link would land in
function markDropTarget(list) {
    const target = list?.closest('.category') || null;
    document.querySelectorAll('.category.drop-target').forEach((el) => {
        if (el !== target) el.classList.remove('drop-target');
    });
    target?.classList.add('drop-target');
}

function stopExpandOnHover() {
    clearTimeout(hoverExpandTimer);
    hoverExpandTimer = null;
    hoverExpandTarget = null;
    document.removeEventListener('pointermove', expandOnHover);
    document.removeEventListener('mousemove', expandOnHover);
}

// Move a link to the top of another category (drop on a category's header)
async function moveLinkToCategory(fromCategory, linkIndex, toCategory) {
    const [moved] = linksData[fromCategory].links.splice(linkIndex, 1);
    if (!moved) return;
    linksData[toCategory].links.unshift(moved);
    expandedCategories.add(toCategory);
    await saveData();
    renderLinks();
}

function initializeSortable(isSearching) {
    const linksList = document.getElementById('linksList');
    if (typeof Sortable === 'undefined') return;

    // #linksList survives re-renders, so its Sortable is created only once
    const existingSortable = Sortable.get(linksList);
    if (existingSortable) {
        existingSortable.option('disabled', isSearching);
    } else {
        new Sortable(linksList, {
            ...SORTABLE_COMMON,
            disabled: isSearching,
            draggable: '.category',
            handle: '.category-header',
            filter: 'button, input, .category-editor',
            onEnd: async function () {
                categoriesOrder = Array.from(linksList.children)
                    .filter(div => div.classList.contains('category'))
                    .map(div => div.dataset.category);
                await saveData();
            }
        });
    }

    if (isSearching) return;

    document.querySelectorAll('.category-links').forEach((categoryLinksEl) => {
        const category = categoryLinksEl.closest('.category')?.dataset.category;
        if (!category) return;

        new Sortable(categoryLinksEl, {
            ...SORTABLE_COMMON,
            draggable: '.link-item',
            group: 'shared-links',
            filter: 'button, input, .category-add-form, .link-editor',
            // The lifted copy is position: fixed. Inside a .category its backdrop-filter becomes the
            // containing block and the copy drifts away from the pointer, so it lives on <body>.
            fallbackOnBody: true,
            onStart: function (evt) {
                markDropTarget(evt.from);
                document.addEventListener('pointermove', expandOnHover);
                document.addEventListener('mousemove', expandOnHover);
            },
            onMove: function (evt) {
                markDropTarget(evt.to);
                return true;
            },
            onEnd: async function (evt) {
                stopExpandOnHover();
                markDropTarget(null);
                const fromCategory = evt.from.closest('.category')?.dataset.category;
                const toCategory = evt.to.closest('.category')?.dataset.category;
                const oldLinkIndex = parseInt(evt.item.dataset.linkIndex);

                // Released on a category header: the link goes to the top of that category
                const point = evt.originalEvent?.changedTouches?.[0] || evt.originalEvent;
                const header = point && categoryHeaderAt(point.clientX, point.clientY);
                const headerCategory = header?.closest('.category')?.dataset.category;
                if (fromCategory && headerCategory && headerCategory !== fromCategory) {
                    await moveLinkToCategory(fromCategory, oldLinkIndex, headerCategory);
                    return;
                }

                if (!fromCategory || !toCategory) return;
                if (fromCategory !== toCategory) {
                    const movedLink = linksData[fromCategory].links[oldLinkIndex];
                    if (movedLink) {
                        linksData[fromCategory].links = linksData[fromCategory].links.filter((_, idx) => idx !== oldLinkIndex);
                        const newIndex = Array.from(evt.to.querySelectorAll('.link-item')).indexOf(evt.item);
                        linksData[toCategory].links.splice(newIndex, 0, movedLink);
                    }
                } else {
                    linksData[category].links = Array.from(categoryLinksEl.querySelectorAll('.link-item'))
                        .map(item => linksData[category].links[parseInt(item.dataset.linkIndex)])
                        .filter(link => link);
                }

                await saveData();
                renderLinks(); // Re-render to update indices
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
    }, 150);
});

// Escape clears the search first. The next Escape closes the popup as usual.
document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && e.target.value) {
        e.preventDefault();
        e.target.value = '';
        renderLinks('');
    }
});

// Add Category Button Handler
document.getElementById('addCategoryBtn').addEventListener('click', promptNewCategory);

async function promptNewCategory() {
    const values = await openDialog({
        title: t('newCategory'),
        fields: [
            {
                name: 'name',
                label: t('name'),
                placeholder: t('namePlaceholder'),
                validate: (value) => {
                    if (!value.trim()) return t('enterName');
                    return linksData[value.trim()] ? t('categoryExists') : '';
                }
            },
            { name: 'description', label: t('descriptionOptional'), placeholder: t('descriptionPlaceholder') }
        ],
        confirmLabel: t('create')
    });
    if (values) addCategory(values.name, values.description);
}

// Modal used instead of alert/confirm/prompt. Resolves to the field values (true when there
// are no fields), or to null when cancelled. Text goes in through textContent, never as HTML.
function openDialog({ title, message, fields = [], confirmLabel = 'OK', danger = false }) {
    const dialog = document.getElementById('appDialog');
    const form = document.createElement('form');
    form.className = 'dialog-form';
    form.noValidate = true;

    const heading = document.createElement('h2');
    heading.textContent = title;
    form.append(heading);

    if (message) {
        const text = document.createElement('p');
        text.textContent = message;
        form.append(text);
    }

    const inputs = fields.map((field) => {
        const label = document.createElement('label');
        label.className = 'dialog-field';
        label.textContent = field.label;
        const input = createTextInput('', field.placeholder || '');
        const error = document.createElement('span');
        error.className = 'dialog-error';
        error.hidden = true;
        label.append(input, error);
        form.append(label);
        input.addEventListener('input', () => { error.hidden = true; });
        return { field, input, error };
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-plain';
    cancelBtn.textContent = t('cancel');
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'submit';
    confirmBtn.className = danger ? 'btn-primary danger' : 'btn-primary';
    confirmBtn.textContent = confirmLabel;
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    actions.append(cancelBtn, confirmBtn);
    form.append(actions);
    dialog.replaceChildren(form);

    return new Promise((resolve) => {
        let result = null;

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            for (const { field, input, error } of inputs) {
                const problem = field.validate?.(input.value);
                if (problem) {
                    error.textContent = problem;
                    error.hidden = false;
                    input.focus();
                    return;
                }
            }
            result = fields.length ? Object.fromEntries(inputs.map(({ field, input }) => [field.name, input.value])) : true;
            dialog.close();
        });

        cancelBtn.addEventListener('click', () => dialog.close());
        dialog.onclick = (e) => {
            if (e.target === dialog) dialog.close();
        };
        dialog.addEventListener('close', () => resolve(result), { once: true });
        dialog.showModal();
        // A destructive action must not be one Enter away
        (inputs[0]?.input ?? (danger ? cancelBtn : confirmBtn)).focus();
    });
}

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
        throw new Error(t('invalidFile'));
    }

    const data = {};
    for (const [name, category] of Object.entries(raw)) {
        if (!category || !Array.isArray(category.links)) {
            throw new Error(t('noLinksList', { name }));
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

        const confirmed = await openDialog({
            title: t('replaceTitle'),
            message: t('replaceText', { file: file.name }),
            confirmLabel: t('replace'),
            danger: true
        });
        if (confirmed) {
            linksData = data;
            categoriesOrder = order;
            await saveData();
            renderLinks();
            showNotification(t('imported'), 'success');
        }
    } catch (error) {
        showNotification(t('importFailed', { error: error.message }), 'error');
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
        const error = new Error(response?.error || t('noResponse'));
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
    signInBtn.innerHTML = `${icon('arrows-clockwise', 'spin')} <span>${escapeHtml(t('signingIn'))}</span>`;

    try {
        // UI switches to signed-in via the googleUser storage change
        await sendToBackground('signIn');
        showNotification(t('signedIn'), 'success');
    } catch (error) {
        console.error('Sign in error:', error);
        showNotification(t('signInFailed', { error: error.message }), 'error');
    } finally {
        resetSignInButton();
    }
}

function resetSignInButton() {
    const signInBtn = document.getElementById('signInBtn');
    signInBtn.disabled = false;
    signInBtn.innerHTML = `${icon('google-logo')} <span data-i18n="signIn">${escapeHtml(t('signIn'))}</span>`;
}

// Handle sign out
async function handleSignOut() {
    closeAccountMenu();
    const confirmed = await openDialog({
        title: t('signOutTitle'),
        message: t('signOutText'),
        confirmLabel: t('signOut')
    });
    if (!confirmed) return;

    try {
        await sendToBackground('signOut');
        showNotification(t('signedOut'), 'success');
    } catch (error) {
        console.error('Sign out error:', error);
        showNotification(t('signOutFailed', { error: error.message }), 'error');
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
        showNotification(t('syncComplete'), 'success');
    } catch (error) {
        console.error('Sync error:', error);
        showNotification(t('syncFailed', { error: error.message }), 'error');
    } finally {
        syncBtn.classList.remove('syncing');
        syncBtn.disabled = false;
    }
}

function closeAccountMenu() {
    const menu = document.getElementById('accountMenu');
    if (menu.matches(':popover-open')) menu.hidePopover();
}

// Open the user's Google Sheet
async function handleOpenSheet() {
    closeAccountMenu();
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
        userAvatar.closest('button').title = user.email;
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
    flushSettings();
});

// Show a short message, optionally with one action such as Undo. Only one shows at a time.
let toastTimer;
function showNotification(message, type = 'info', action) {
    document.querySelector('.toast')?.remove();
    clearTimeout(toastTimer);

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(text);

    if (action) {
        const button = document.createElement('button');
        button.textContent = action.label;
        button.addEventListener('click', () => {
            toast.remove();
            action.run();
        });
        toast.append(button);
    }

    // Toasts must stay above an open modal dialog
    (document.getElementById('appDialog').open ? document.getElementById('appDialog') : document.body).append(toast);

    toastTimer = setTimeout(() => {
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 200);
    }, action ? 6000 : 3000);
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
    label.textContent = t('saveToNewCategory', { title: pending.title || pending.url });
    label.title = pending.url;

    const nameInput = createTextInput('', t('categoryName'), pending.suggestedName);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-primary save-link-btn';
    saveBtn.textContent = t('save');

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-plain';
    cancelBtn.textContent = t('cancel');

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    actions.append(cancelBtn, saveBtn);

    form.append(label, nameInput, actions);
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
        showNotification(t('savedTo', { name }), 'success');
    });

    cancelBtn.addEventListener('click', () => container.replaceChildren());

    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveBtn.click();
    });
    onEscape(nameInput, () => container.replaceChildren());
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

// Settings panel: show the current values and apply every change live
function showSettings(settings) {
    for (const [id, on] of [['themeLight', settings.theme === 'light'], ['themeDark', settings.theme === 'dark'],
        ['langVi', settings.lang === 'vi'], ['langEn', settings.lang === 'en']]) {
        document.getElementById(id).setAttribute('aria-pressed', String(on));
    }
    document.getElementById('transparencyRange').value = settings.transparency;
    document.getElementById('transparencyValue').textContent = settings.transparency;
    document.getElementById('blurRange').value = settings.blur;
    document.getElementById('blurValue').textContent = `${settings.blur}px`;
}

async function changeSettings(patch) {
    const settings = await saveSettings(patch);
    showSettings(settings);
    renderLinks(); // Re-render text made by JS in the new language
}

function initSettingsPanel() {
    document.getElementById('themeLight').addEventListener('click', () => changeSettings({ theme: 'light' }));
    document.getElementById('themeDark').addEventListener('click', () => changeSettings({ theme: 'dark' }));
    document.getElementById('langVi').addEventListener('click', () => changeSettings({ lang: 'vi' }));
    document.getElementById('langEn').addEventListener('click', () => changeSettings({ lang: 'en' }));
    document.getElementById('transparencyRange').addEventListener('input', (e) => changeSettings({ transparency: Number(e.target.value) }));
    document.getElementById('blurRange').addEventListener('input', (e) => changeSettings({ blur: Number(e.target.value) }));
    // Reset the look; the language is a separate, explicit choice and stays
    document.getElementById('settingsReset').addEventListener('click', () => changeSettings({ ...DEFAULT_SETTINGS }));
}

// Settings (language included) must be known before anything is rendered
async function initSettings() {
    try {
        const settings = await loadSettings();
        applySettings(settings);
        showSettings(settings);
    } catch (error) {
        console.error('Could not read settings:', error);
        applyI18n(document);
    }
    initSettingsPanel();
}

// The list scrolls under the glass bars: keep its padding equal to their live heights
function trackBarHeights() {
    const container = document.querySelector('.container');
    const observer = new ResizeObserver(() => {
        container.style.setProperty('--top-h', `${document.querySelector('.bar-top').offsetHeight}px`);
        container.style.setProperty('--foot-h', `${document.querySelector('.bar-foot').offsetHeight}px`);
    });
    observer.observe(document.querySelector('.bar-top'));
    observer.observe(document.querySelector('.bar-foot'));
}

trackBarHeights();
initSettings().then(() => {
    initializeSync();
    return loadData();
}).then(showPendingSave);
// Entrance animation plays once, not on every re-render
setTimeout(() => document.body.classList.remove('first-render'), 700);
