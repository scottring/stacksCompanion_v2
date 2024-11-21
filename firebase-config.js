// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCdSgohwFoiRjyiHntEVCnsZOof_wtuGck",
    authDomain: "stacks-companion-68225.firebaseapp.com",
    projectId: "stacks-companion-68225",
    storageBucket: "stacks-companion-68225.firebasestorage.app",
    messagingSenderId: "1011290604695",
    appId: "1:1011290604695:web:461e7a9df4855fc81055d2",
    region: "europe-west1" // European data center
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Set the Firestore database location to Europe
db.settings({
    ignoreUndefinedProperties: true,
    host: "firestore.europe-west1.googleapis.com"
});

// Export the database instance
export const firestore = db;
