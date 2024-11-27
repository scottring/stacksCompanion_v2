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
// Helper function to extract field value from multiple possible keys
function getFieldValue(data, fields) {
    for (const field of fields) {
        if (data[field]) {
            return data[field];
        }
    }
    return undefined;
}
// Main function
exports.createFormFromSheet = (0, https_1.onRequest)({
    region: 'europe-west1',
    maxInstances: 10,
    cors: true
}, async (request, response) => {
    response.set('Access-Control-Allow-Origin', '*');
    response.set('Access-Control-Allow-Methods', 'POST');
    response.set('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS') {
        response.status(204).send('');
        return;
    }
    try {
        if (request.method !== 'POST') {
            response.status(405).json({
                success: false,
                message: 'Method not allowed'
            });
            return;
        }
        // Log complete request details
        console.log('Request Headers:', request.headers);
        console.log('Raw Body:', request.rawBody ? request.rawBody.toString() : 'No raw body');
        console.log('Parsed Body:', request.body);
        try {
            const requestData = request.body;
            // Try to extract required fields from multiple possible field names
            const companyName = getFieldValue(requestData, [
                'company_name',
                'Company',
                'Company Name',
                'CompanyName'
            ]);
            const sheetName = getFieldValue(requestData, [
                'sheet_name',
                'Sheet',
                'Sheet Name',
                'SheetName'
            ]);
            const email = getFieldValue(requestData, [
                'email',
                'Email',
                'EmailAddress'
            ]);
            // Log extracted values
            console.log('Extracted values:', {
                companyName,
                sheetName,
                email,
                allKeys: Object.keys(requestData)
            });
            // Validate required fields
            if (!companyName || !sheetName || !email) {
                const errorMsg = `Missing required fields. Found: company=${companyName}, sheet=${sheetName}, email=${email}. Available fields: ${Object.keys(requestData).join(', ')}`;
                console.error(errorMsg);
                throw new Error(errorMsg);
            }
            // Generate unique form ID
            const formId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            // Create form data
            const formData = {
                companyName,
                sheetName,
                email,
                status: 'pending',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                reviewers: {
                    qualityControl: {
                        email: '',
                        status: 'pending'
                    },
                    safetyOfficer: {
                        email: '',
                        status: 'pending'
                    },
                    productionManager: {
                        email: '',
                        status: 'pending'
                    },
                    environmentalOfficer: {
                        email: '',
                        status: 'pending'
                    }
                }
            };
            // Save to Firestore
            await admin.firestore().collection('forms').doc(formId).set(formData);
            // Generate form URL
            const formUrl = new URL('https://internal-review.stacksdata.com');
            formUrl.searchParams.set('id', formId);
            formUrl.searchParams.set('company', companyName);
            formUrl.searchParams.set('sheet', sheetName);
            // Send email notification
            await admin.firestore().collection('mail').add({
                to: email,
                message: {
                    subject: `Product Review Form Ready - ${sheetName}`,
                    html: `
            <h2>Product Review Form Ready</h2>
            <p>Hello,</p>
            <p>A review form has been created for:</p>
            <ul>
              <li>Company: ${companyName}</li>
              <li>Sheet Name: ${sheetName}</li>
            </ul>
            <p>Please click the link below to access and complete the form:</p>
            <p><a href="${formUrl.toString()}">${formUrl.toString()}</a></p>
            <p>You will need to:</p>
            <ol>
              <li>Fill in all required product information</li>
              <li>Upload any necessary documentation</li>
              <li>Assign reviewers for the approval workflow</li>
            </ol>
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