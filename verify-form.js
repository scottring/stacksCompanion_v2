require('dotenv').config();
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./firebase-service-account.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://stacks-companion-68225.firebaseio.com"
});

async function verifyForm(formId) {
    try {
        const formDoc = await admin.firestore().collection('forms').doc(formId).get();
        if (!formDoc.exists) {
            console.log('Form not found');
            return;
        }
        console.log('Form data:', formDoc.data());
    } catch (error) {
        console.error('Error:', error);
    }
    process.exit(0);
}

// Use the formId from the previous test
verifyForm('1732619146035');
