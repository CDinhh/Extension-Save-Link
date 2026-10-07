// Cloud storage in a Google Sheet inside the user's own Google Drive.
// One row per link; a category without links gets one row with an empty URL.
// Rows are read and written on the first sheet (tab) of the spreadsheet.

const SHEET_APP_PROPERTY = 'linkInventory'; // Marks the spreadsheet this extension created
const SHEET_TITLE = 'Link Inventory Extension [Dont delete]';
const SHEET_HEADER = ['Category', 'Category description', 'Category color', 'URL', 'Description', 'Done', 'Added'];
const SHEET_RANGE = 'A:G';
const DEFAULT_CATEGORY_COLOR = '#2196F3';

// Thrown when the user deleted the sync sheet: sync pauses until they choose what to do
class SheetDeletedError extends Error { }

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

class SheetsSync {
    constructor(auth) {
        this.auth = auth;
    }

    async request(url, options = {}, isRetry = false) {
        const token = await this.auth.getAccessToken();
        const response = await fetch(url, {
            ...options,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 401) {
            // Token revoked or expired early: refresh it silently and retry once
            await this.auth.clearAccessToken();
            if (!isRetry) return this.request(url, options, true);
            throw new AuthRequiredError('Google session expired. Click sync to sign in again.');
        }
        if (!response.ok) {
            const text = await response.text();
            const error = new Error(`Google API error ${response.status}: ${text.slice(0, 300)}`);
            error.status = response.status;
            throw error;
        }
        return response.json();
    }

    // The sheet with this ID ({ id, version, modifiedTime }), or null if it was deleted or trashed.
    // Reading by ID is immediately consistent, unlike findSheet().
    async getSheet(sheetId) {
        try {
            const sheet = await this.request(`${DRIVE_API}/${sheetId}?fields=id,version,modifiedTime,trashed`);
            return sheet.trashed ? null : sheet;
        } catch (error) {
            if (error.status === 404) return null;
            throw error;
        }
    }

    // Search for the extension's spreadsheet ({ id, version, modifiedTime }), or null if there is none.
    // Drive search can lag behind for a newly created file, so prefer getSheet() when the ID is known.
    async findSheet() {
        const query = `appProperties has { key='${SHEET_APP_PROPERTY}' and value='1' } and trashed = false`;
        const url = `${DRIVE_API}?q=${encodeURIComponent(query)}&orderBy=createdTime` +
            `&fields=${encodeURIComponent('files(id,version,modifiedTime)')}`;
        const result = await this.request(url);
        return result.files?.[0] || null;
    }

    async getSheetMeta(sheetId) {
        return this.request(`${DRIVE_API}/${sheetId}?fields=id,version,modifiedTime`);
    }

    async createSheet() {
        const file = await this.request(`${DRIVE_API}?fields=id,version,modifiedTime`, {
            method: 'POST',
            body: JSON.stringify({
                name: SHEET_TITLE,
                mimeType: 'application/vnd.google-apps.spreadsheet',
                appProperties: { [SHEET_APP_PROPERTY]: '1' }
            })
        });

        // Cosmetic only: a failure here must not break sync
        try {
            await this.formatSheet(file.id);
        } catch (error) {
            console.warn('Could not format sheet:', error);
        }
        return file;
    }

    // Bold frozen header and a checkbox for the Done column
    async formatSheet(sheetId) {
        await this.request(`${SHEETS_API}/${sheetId}:batchUpdate`, {
            method: 'POST',
            body: JSON.stringify({
                requests: [
                    {
                        updateSheetProperties: {
                            properties: { sheetId: 0, title: 'Links', gridProperties: { frozenRowCount: 1 } },
                            fields: 'title,gridProperties.frozenRowCount'
                        }
                    },
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
                            cell: { userEnteredFormat: { textFormat: { bold: true } } },
                            fields: 'userEnteredFormat.textFormat.bold'
                        }
                    },
                    {
                        setDataValidation: {
                            range: { sheetId: 0, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 },
                            rule: { condition: { type: 'BOOLEAN' } }
                        }
                    }
                ]
            })
        });
    }

    // Read the sheet into { data, categoriesOrder }
    async download(sheetId) {
        const result = await this.request(
            `${SHEETS_API}/${sheetId}/values/${encodeURIComponent(SHEET_RANGE)}?valueRenderOption=UNFORMATTED_VALUE`
        );
        return rowsToData(result.values || []);
    }

    // Replace the sheet content; returns the new { id, version, modifiedTime }
    async upload(sheetId, data, categoriesOrder) {
        const values = [SHEET_HEADER, ...dataToRows(data, categoriesOrder)];

        // Write first, then clear leftover rows, so the sheet is never empty in between.
        // RAW: values are stored as typed, a URL starting with "=" never becomes a formula.
        await this.request(
            `${SHEETS_API}/${sheetId}/values/${encodeURIComponent(`A1:G${values.length}`)}?valueInputOption=RAW`,
            { method: 'PUT', body: JSON.stringify({ values }) }
        );
        await this.request(
            `${SHEETS_API}/${sheetId}/values/${encodeURIComponent(`A${values.length + 1}:G`)}:clear`,
            { method: 'POST', body: '{}' }
        );

        return this.getSheetMeta(sheetId);
    }
}

// Category names in display order (order list first, then any missing ones)
function orderedCategories(data, categoriesOrder = []) {
    return [
        ...categoriesOrder.filter(cat => data[cat]),
        ...Object.keys(data).filter(cat => !categoriesOrder.includes(cat))
    ];
}

function dataToRows(data, categoriesOrder) {
    const rows = [];
    for (const name of orderedCategories(data, categoriesOrder)) {
        const category = data[name];
        const categoryCells = [name, category.description || '', category.color || DEFAULT_CATEGORY_COLOR];
        const links = category.links || [];

        if (links.length === 0) {
            rows.push([...categoryCells, '', '', false, '']);
        }
        for (const link of links) {
            rows.push([
                ...categoryCells,
                link.url,
                link.description || '',
                !!link.done,
                new Date(link.timestamp || Date.now()).toISOString()
            ]);
        }
    }
    return rows;
}

// Parse rows back, tolerating manual edits in the sheet (blank cells, text "TRUE", bad colors...)
function rowsToData(values) {
    const data = {};
    const categoriesOrder = [];
    const rows = values[0]?.[0] === SHEET_HEADER[0] ? values.slice(1) : values;

    for (const row of rows) {
        const [category, categoryDesc, color, url, description, done, added] =
            SHEET_HEADER.map((_, i) => row[i] ?? '');
        const linkUrl = String(url).trim();
        const name = String(category).trim() || (linkUrl ? 'Uncategorized' : '');
        if (!name) continue;

        if (!data[name]) {
            data[name] = {
                description: String(categoryDesc),
                color: /^#[0-9a-f]{6}$/i.test(color) ? String(color).toLowerCase() : DEFAULT_CATEGORY_COLOR,
                links: []
            };
            categoriesOrder.push(name);
        }

        if (linkUrl) {
            // A date typed into the sheet by hand comes back as a serial day number
            const timestamp = typeof added !== 'number' ? Date.parse(added)
                : added < 1e8 ? Math.round((added - 25569) * 86400000) : added;
            data[name].links.push({
                url: linkUrl,
                description: String(description),
                done: done === true || String(done).toUpperCase() === 'TRUE',
                timestamp: Number.isFinite(timestamp) ? timestamp : Date.now()
            });
        }
    }

    return { data, categoriesOrder };
}

const sheetsSync = new SheetsSync(googleAuth);
