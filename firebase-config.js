// Firebase Configuration
// Replace these values with your Firebase project credentials
const firebaseConfig = {
    apiKey: "AIzaSyC2zX-fLQjsrchVXnDTDxnH9HLgiAYvxHw",
    authDomain: "link-inventory.firebaseapp.com",
    projectId: "link-inventory",
    storageBucket: "link-inventory.firebasestorage.app",
    messagingSenderId: "251981806171",
    appId: "1:251981806171:web:963f8854938fefa521dd7e"
};

// Firestore collection name for storing links
const FIRESTORE_COLLECTION = 'userLinks';

// Export configuration
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { firebaseConfig, FIRESTORE_COLLECTION };
}
