// Firebase Configuration - EXAMPLE FILE
// 
// IMPORTANT:
// 1. Copy this file to "firebase-config.js"
// 2. Replace all YOUR_* values with your actual Firebase credentials
// 3. Follow setup guide in FIREBASE_SETUP.md
//
// When deploying to Chrome Web Store:
// - Keep real credentials in firebase-config.js
// - All users will use your Firebase project
// - This is SAFE as each user can only access their own data (via Security Rules)

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Firestore collection name for storing links
const FIRESTORE_COLLECTION = 'userLinks';

// Export configuration
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { firebaseConfig, FIRESTORE_COLLECTION };
}
