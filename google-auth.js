// Google Sign-In for the extension
// Uses launchWebAuthFlow so it works in Chrome, Edge, Brave, Cốc Cốc, etc.

const GOOGLE_CLIENT_ID = '251981806171-kpdq26b7htmqbp0qa7joseqou2jfqt1t.apps.googleusercontent.com';
// drive.file: access only to files this extension creates (the user's Link Inventory sheet)
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GOOGLE_SCOPES = `openid email profile ${DRIVE_FILE_SCOPE}`;

// Thrown when the user has to click "Sign in" / "Sync" again
class AuthRequiredError extends Error { }

// Decode a JWT payload (base64url + UTF-8, so non-ASCII names like "Định" survive)
function decodeJwtPayload(token) {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
}

class GoogleAuth {
    // Run the OAuth flow. interactive=false refreshes silently and fails if the user must act.
    async authorize(interactive) {
        const currentUser = await this.getUser();
        const state = crypto.randomUUID();
        const nonce = crypto.randomUUID();

        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', chrome.identity.getRedirectURL('oauth-redirect.html'));
        authUrl.searchParams.set('response_type', 'token id_token');
        authUrl.searchParams.set('scope', GOOGLE_SCOPES);
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('nonce', nonce);
        authUrl.searchParams.set('prompt', interactive ? 'select_account' : 'none');
        if (!interactive && currentUser) {
            authUrl.searchParams.set('login_hint', currentUser.email);
        }

        const responseUrl = await chrome.identity.launchWebAuthFlow({
            url: authUrl.toString(),
            interactive
        });

        const params = new URLSearchParams(new URL(responseUrl).hash.substring(1));
        if (params.get('error')) {
            throw new Error(`Google sign-in failed: ${params.get('error')}`);
        }
        if (params.get('state') !== state) {
            throw new Error('OAuth state mismatch');
        }

        const accessToken = params.get('access_token');
        const idToken = params.get('id_token');
        if (!accessToken || !idToken) {
            throw new Error('No token received from Google');
        }

        const payload = decodeJwtPayload(idToken);
        if (payload.nonce !== nonce) {
            throw new Error('ID token nonce mismatch');
        }

        // Google's consent screen lets the user untick the Drive permission
        const grantedScopes = (params.get('scope') || '').split(' ');
        if (!grantedScopes.includes(DRIVE_FILE_SCOPE)) {
            throw new Error('Please allow access to Google Drive files so links can be saved to your Google Sheet');
        }

        const user = {
            userId: payload.sub,
            email: payload.email,
            name: payload.name,
            picture: payload.picture
        };

        if (!interactive && currentUser && currentUser.userId !== user.userId) {
            throw new Error('Signed in Google account changed');
        }

        const expiresIn = Number(params.get('expires_in')) || 3600;
        // Access token lives in session storage: cleared when the browser closes
        await chrome.storage.session.set({
            googleAccessToken: accessToken,
            googleTokenExpiry: Date.now() + expiresIn * 1000
        });
        await chrome.storage.local.set({ googleUser: user });

        return user;
    }

    signIn() {
        return this.authorize(true);
    }

    async signOut() {
        await this.clearAccessToken();
        await chrome.storage.local.remove('googleUser');
    }

    async getUser() {
        const { googleUser } = await chrome.storage.local.get('googleUser');
        return googleUser || null;
    }

    async clearAccessToken() {
        await chrome.storage.session.remove(['googleAccessToken', 'googleTokenExpiry']);
    }

    // Valid access token. Expired tokens are refreshed silently; when that needs
    // the user (e.g. signed out of Google), only an interactive call may show the sign-in window.
    async getAccessToken(interactive = false) {
        const { googleAccessToken, googleTokenExpiry } =
            await chrome.storage.session.get(['googleAccessToken', 'googleTokenExpiry']);
        if (googleAccessToken && Date.now() < googleTokenExpiry - 60 * 1000) {
            return googleAccessToken;
        }

        try {
            await this.authorize(false);
        } catch (error) {
            if (!interactive) {
                console.warn('Silent token refresh failed:', error);
                throw new AuthRequiredError('Google session expired. Click sync to sign in again.');
            }
            await this.authorize(true);
        }

        const { googleAccessToken: refreshed } = await chrome.storage.session.get('googleAccessToken');
        return refreshed;
    }
}

const googleAuth = new GoogleAuth();
