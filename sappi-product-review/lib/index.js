"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFormFromSheet = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin
admin.initializeApp();
// Field name normalization helper
const normalizeFieldName = (data, originalField, encodedField) => {
    const value = data[originalField] || data[encodedField];
    if (!value) {
        throw new Error(`Missing required field: ${originalField}`);
    }
    return value;
};
// Main function
exports.createFormFromSheet = (0, https_1.onRequest)({
    region: 'europe-west1',
    maxInstances: 10,
    cors: true // Enable CORS for all origins
}, async (request, response) => {
    // Set CORS headers
    response.set('Access-Control-Allow-Origin', '*');
    response.set('Access-Control-Allow-Methods', 'POST');
    response.set('Access-Control-Allow-Headers', 'Content-Type');
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
        response.status(204).send('');
        return;
    }
    try {
        // Only allow POST requests
        if (request.method !== 'POST') {
            response.status(405).json({
                success: false,
                message: 'Method not allowed'
            });
            return;
        }
        console.log('Received request body:', request.body);
        // Extract and validate fields with improved error handling
        try {
            const requestData = request.body;
            const companyName = normalizeFieldName(requestData, "Sheet's Company Name", "Sheet&#39;s Company Name");
            const productName = normalizeFieldName(requestData, "Sheet's Product Name", "Sheet&#39;s Product Name");
            const requesterEmail = normalizeFieldName(requestData, "Sheet Creator's Email", "Sheet Creator&#39;s Email");
            console.log('Parsed data:', { companyName, productName, requesterEmail });
            // Generate unique form ID
            const formId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            // Create form data
            const formData = {
                companyName,
                productName,
                requesterEmail,
                status: 'pending',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };
            // Save to Firestore
            await admin.firestore().collection('forms').doc(formId).set(formData);
            // Generate form URL
            const formUrl = new URL('https://internal-review.stacksdata.com');
            formUrl.searchParams.set('id', formId);
            formUrl.searchParams.set('company', companyName);
            formUrl.searchParams.set('product', productName);
            // Send email using Firebase Extension
            await admin.firestore().collection('mail').add({
                to: requesterEmail,
                message: {
                    subject: `Review Form Ready - ${productName}`,
                    html: `
            <h2>Product Review Form Ready</h2>
            <p>Hello,</p>
            <p>Your sheet has been approved and a review form has been created for:</p>
            <ul>
              <li>Company: ${companyName}</li>
              <li>Product: ${productName}</li>
            </ul>
            <p>Please click the link below to access the form:</p>
            <p><a href="${formUrl.toString()}">${formUrl.toString()}</a></p>
            <p>You can review the pre-filled information and set up the approval workflow.</p>
          `
                }
            });
            response.status(200).json({
                success: true,
                formUrl: formUrl.toString(),
                formId,
                message: 'Form created and email sent successfully'
            });
            return;
        }
        catch (validationError) {
            console.error('Validation error:', validationError);
            response.status(400).json({
                success: false,
                message: validationError instanceof Error ? validationError.message : 'Invalid input'
            });
            return;
        }
    }
    catch (error) {
        console.error('Error processing request:', error);
        response.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return;
    }
});
//# sourceMappingURL=index.js.map