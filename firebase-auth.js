// Firebase Auth Service for Chrome Extension
// Works across all browsers (Chrome, Edge, Brave, Cốc Cốc, etc.)
// Uses Firebase Auth popup in separate window

class FirebaseAuthService {
    constructor() {
        this.user = null;
        this.idToken = null;
    }

    // Sign in using chrome.identity directly
    async signIn() {
        try {
            const CLIENT_ID = '251981806171-kpdq26b7htmqbp0qa7joseqou2jfqt1t.apps.googleusercontent.com';
            const REDIRECT_URI = chrome.identity.getRedirectURL('oauth-redirect.html');
            const SCOPE = 'openid email profile';

            // Build OAuth URL
            const state = Math.random().toString(36).substring(7);
            const nonce = Math.random().toString(36).substring(7);

            const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
            authUrl.searchParams.set('client_id', CLIENT_ID);
            authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
            authUrl.searchParams.set('response_type', 'token id_token');
            authUrl.searchParams.set('scope', SCOPE);
            authUrl.searchParams.set('state', state);
            authUrl.searchParams.set('nonce', nonce);
            authUrl.searchParams.set('prompt', 'select_account');

            console.log('🔑 Starting OAuth flow...');

            // Launch OAuth flow
            return new Promise((resolve, reject) => {
                chrome.identity.launchWebAuthFlow({
                    url: authUrl.toString(),
                    interactive: true
                }, async (responseUrl) => {
                    if (chrome.runtime.lastError) {
                        console.error('❌ OAuth error:', chrome.runtime.lastError);
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }

                    console.log('✅ Got response URL');

                    try {
                        // Parse tokens from URL hash
                        const url = new URL(responseUrl);
                        const hash = url.hash.substring(1);
                        const params = new URLSearchParams(hash);

                        const idToken = params.get('id_token');

                        if (!idToken) {
                            throw new Error('No ID token received');
                        }

                        console.log('🎉 Got Google ID token!');

                        // Parse user info from Google ID token
                        const tokenParts = idToken.split('.');
                        const payload = JSON.parse(atob(tokenParts[1].replace(/-/g, '+').replace(/_/g, '/')));

                        // Use Google's sub (subject ID) as unique identifier
                        // sub is a unique, non-guessable ID for each Google account
                        this.user = {
                            userId: payload.sub,  // Unique Google user ID (không đoán được)
                            email: payload.email,
                            name: payload.name,
                            picture: payload.picture
                        };
                        this.idToken = idToken;

                        console.log('👤 User:', this.user.email);
                        console.log('🔑 User ID:', this.user.userId);
                        console.log('✅ Google authentication complete!');

                        // Save to storage
                        await chrome.storage.local.set({
                            firebaseUser: this.user,
                            firebaseIdToken: this.idToken
                        });

                        resolve(this.user);

                    } catch (parseError) {
                        console.error('❌ Parse error:', parseError);
                        reject(parseError);
                    }
                });
            });
        } catch (error) {
            console.error('Sign in error:', error);
            throw error;
        }
    }

    // Initialize - restore from storage
    async init() {
        try {
            const result = await chrome.storage.local.get(['firebaseUser', 'firebaseIdToken']);
            if (result.firebaseUser && result.firebaseIdToken) {
                this.user = result.firebaseUser;
                this.idToken = result.firebaseIdToken;
                return true;
            }
            return false;
        } catch (error) {
            console.error('Init error:', error);
            return false;
        }
    }

    // Sign out
    async signOut() {
        this.user = null;
        this.idToken = null;
        await chrome.storage.local.remove(['firebaseUser', 'firebaseIdToken']);
    }

    // Get current user
    getUser() {
        return this.user;
    }

    // Get ID token
    getIdToken() {
        return this.idToken;
    }

    // Check if token is expired
    isTokenExpired() {
        if (!this.idToken) {
            console.log('⚠️ No token found');
            return true;
        }

        try {
            const tokenParts = this.idToken.split('.');
            const payload = JSON.parse(atob(tokenParts[1].replace(/-/g, '+').replace(/_/g, '/')));
            const expiry = payload.exp * 1000; // Convert to milliseconds
            const now = Date.now();
            const timeLeft = expiry - now;

            console.log(`⏰ Token expires in: ${Math.floor(timeLeft / 1000 / 60)} minutes`);

            // Add 5 minute buffer to refresh before actual expiry
            const isExpired = now >= (expiry - 5 * 60 * 1000);
            console.log(`Token expired: ${isExpired}`);
            return isExpired;
        } catch (error) {
            console.error('Error checking token expiry:', error);
            return true;
        }
    }

    // Get valid ID token, refresh if needed
    async getValidIdToken() {
        console.log('🔍 Checking token validity...');

        if (this.isTokenExpired()) {
            console.log('🔄 Token expired, refreshing...');
            try {
                await this.signIn();
                console.log('✅ Token refreshed successfully');
            } catch (error) {
                console.error('❌ Failed to refresh token:', error);
                throw error;
            }
        } else {
            console.log('✅ Token is still valid');
        }

        return this.idToken;
    }
}

const firebaseAuth = new FirebaseAuthService();
