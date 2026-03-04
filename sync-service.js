// Sync Service for Google Cloud Firestore
class SyncService {
    constructor() {
        this.projectId = firebaseConfig.projectId;
        this.apiKey = firebaseConfig.apiKey;
        this.collection = FIRESTORE_COLLECTION;
        this.isSyncing = false;
    }

    // Initialize and check login status
    async init() {
        try {
            const isLoggedIn = await firebaseAuth.init();
            return isLoggedIn;
        } catch (error) {
            console.error('Init error:', error);
            return false;
        }
    }

    // Sign in with Google via Firebase Auth
    async signIn() {
        try {
            const user = await firebaseAuth.signIn();
            return user;
        } catch (error) {
            console.error('Sign in error:', error);
            throw error;
        }
    }

    // Sign out
    async signOut() {
        try {
            await firebaseAuth.signOut();
            return true;
        } catch (error) {
            console.error('Sign out error:', error);
            throw error;
        }
    }

    // Get user document ID (Google sub ID-based)
    getUserDocId() {
        const user = firebaseAuth.getUser();
        if (!user) return null;
        // Dùng Google sub (unique user ID) thay vì email
        // sub không thể đoán được, an toàn hơn email
        return user.userId || user.email.replace(/[^a-zA-Z0-9]/g, '_');
    }

    // Upload data to Firestore
    async uploadData(data, categoriesOrder = []) {
        const user = firebaseAuth.getUser();
        if (!user) {
            throw new Error('Not authenticated');
        }

        try {
            this.isSyncing = true;
            const docId = this.getUserDocId();
            const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${this.collection}/${docId}?key=${this.apiKey}`;

            // Prepare Firestore document
            const firestoreDoc = {
                fields: {
                    userId: { stringValue: user.userId },
                    email: { stringValue: user.email },
                    data: { stringValue: JSON.stringify(data) },
                    categoriesOrder: { stringValue: JSON.stringify(categoriesOrder) },
                    lastModified: { timestampValue: new Date().toISOString() }
                }
            };

            const response = await fetch(url, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(firestoreDoc)
            });

            if (!response.ok) {
                const errorData = await response.text();
                console.error('Upload error response:', errorData);
                throw new Error(`Failed to upload data: ${response.status}`);
            }

            const result = await response.json();
            this.isSyncing = false;
            return result;
        } catch (error) {
            this.isSyncing = false;
            console.error('Upload data error:', error);
            throw error;
        }
    }

    // Download data from Firestore
    async downloadData() {
        const user = firebaseAuth.getUser();
        if (!user) {
            throw new Error('Not authenticated');
        }

        try {
            this.isSyncing = true;
            const docId = this.getUserDocId();
            const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${this.collection}/${docId}?key=${this.apiKey}`;

            const response = await fetch(url, {
                method: 'GET'
            });

            if (response.status === 404) {
                // Document doesn't exist yet
                this.isSyncing = false;
                return null;
            }

            if (!response.ok) {
                throw new Error(`Failed to download data: ${response.status}`);
            }

            const result = await response.json();
            this.isSyncing = false;

            // Parse Firestore document
            if (result.fields && result.fields.data && result.fields.data.stringValue) {
                const data = JSON.parse(result.fields.data.stringValue);
                const categoriesOrder = result.fields.categoriesOrder
                    ? JSON.parse(result.fields.categoriesOrder.stringValue)
                    : [];
                const lastModified = result.fields.lastModified?.timestampValue || null;
                return { data, categoriesOrder, lastModified };
            }

            return null;
        } catch (error) {
            this.isSyncing = false;
            console.error('Download data error:', error);
            throw error;
        }
    }

    // Sync local data with cloud (Last Write Wins)
    async syncData(localData, localCategoriesOrder = []) {
        const user = firebaseAuth.getUser();
        if (!user) {
            throw new Error('Not authenticated');
        }

        try {
            // Get local last modified timestamp
            const localResult = await chrome.storage.local.get('dataLastModified');
            const localLastModified = localResult.dataLastModified;

            // Download cloud data with timestamp
            const cloudResult = await this.downloadData();

            if (!cloudResult) {
                // No cloud data, upload local data
                await this.uploadData(localData, localCategoriesOrder);
                await chrome.storage.local.set({ dataLastModified: new Date().toISOString() });
                return { data: localData, categoriesOrder: localCategoriesOrder };
            }

            const { data: cloudData, categoriesOrder: cloudCategoriesOrder = [], lastModified: cloudLastModified } = cloudResult;

            // Compare timestamps - Last Write Wins
            if (!localLastModified) {
                // No local timestamp, cloud wins (first sync)
                console.log('🔽 First sync - downloading cloud data');
                await chrome.storage.local.set({ dataLastModified: cloudLastModified });
                return { data: cloudData, categoriesOrder: cloudCategoriesOrder };
            }

            const localTime = new Date(localLastModified).getTime();
            const cloudTime = new Date(cloudLastModified).getTime();

            if (cloudTime > localTime) {
                // Cloud is newer, download and overwrite local
                console.log('☁️ Cloud data is newer - downloading');
                console.log('☁️ Cloud categories order:', cloudCategoriesOrder);
                await chrome.storage.local.set({ dataLastModified: cloudLastModified });
                return { data: cloudData, categoriesOrder: cloudCategoriesOrder };
            } else if (localTime > cloudTime) {
                // Local is newer, upload and overwrite cloud
                console.log('💻 Local data is newer - uploading');
                console.log('💻 Local categories order:', localCategoriesOrder);
                await this.uploadData(localData, localCategoriesOrder);
                await chrome.storage.local.set({ dataLastModified: new Date().toISOString() });
                return { data: localData, categoriesOrder: localCategoriesOrder };
            } else {
                // Same timestamp, no changes
                console.log('✅ Data already in sync');
                return { data: localData, categoriesOrder: localCategoriesOrder };
            }
        } catch (error) {
            console.error('Sync error:', error);
            throw error;
        }
    }

    // Get sync status
    getStatus() {
        const user = firebaseAuth.getUser();
        return {
            isSignedIn: !!user,
            user: user,
            isSyncing: this.isSyncing
        };
    }
}

// Create singleton instance
const syncService = new SyncService();
