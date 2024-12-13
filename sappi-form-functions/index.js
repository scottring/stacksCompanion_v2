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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testSendGrid = exports.handleReviewNotifications = exports.submitReviewDecision = exports.updateFormStatus = exports.sendReviewEmails = exports.createFormFromSheet = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const app_1 = require("firebase-admin/app");
const firestore_2 = require("firebase-admin/firestore");
const sgMail = __importStar(require("@sendgrid/mail"));
const cors = require("cors");
const admin = __importStar(require("firebase-admin"));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { testSendGrid } = require('./test-sendgrid');

// Initialize Firebase Admin only if not already initialized
if (getApps().length === 0) {
    initializeApp();
}

// Field name normalization helper
const normalizeFieldName = (data, originalField, encodedField) => {
    const value = data[originalField] || data[encodedField];
    if (!value) {
        throw new Error(`Missing required field: ${originalField}`);
    }
    return value.trim();
};
// Constants
const BASE_URL = 'https://internal-review.stacksdata.com';
const FROM_EMAIL = 'admin@stacksdata.com';
// Initialize cors middleware
const corsMiddleware = cors({ origin: true });
// Add these test email patterns to your validation
const isTestEmail = (email) => {
    return email.endsWith('@example.com') ||
        email.includes('+test@') ||
        email.endsWith('@mailinator.com');
};
// Add this configuration object
const functionConfig = {
    region: 'europe-west1',
    secrets: ['SENDGRID_API_KEY']
};
// Main function
exports.createFormFromSheet = (0, https_1.onRequest)({
    region: 'europe-west1',
    maxInstances: 10,
    secrets: ['SENDGRID_API_KEY']
}, (request, response) => __awaiter(void 0, void 0, void 0, function* () {
    // Handle CORS
    yield new Promise((resolve) => corsMiddleware(request, response, () => resolve()));
    console.log('request.body', request.body);
    try {
        // Validate SendGrid configuration
        const sendGridKey = process.env.SENDGRID_API_KEY;
        if (!(sendGridKey === null || sendGridKey === void 0 ? void 0 : sendGridKey.startsWith('SG.'))) {
            response.status(500).json({
                success: false,
                message: 'Invalid SendGrid API key configuration'
            });
            return;
        }
        sgMail.setApiKey(sendGridKey);
        // Validate request method
        if (request.method !== 'POST') {
            response.status(405).json({
                success: false,
                message: 'Method not allowed'
            });
            return;
        }
        // Extract and validate fields with improved error handling
        try {
            const requestData = request.body;
            const companyName = normalizeFieldName(requestData, "Sheet's Company Name", "Sheet&#39;s Company Name");
            const productName = normalizeFieldName(requestData, "Sheet's Product Name", "Sheet&#39;s Product Name");
            const requesterEmail = normalizeFieldName(requestData, "Sheet Creator's Email", "Sheet Creator&#39;s Email");
            // Validate email format
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail) || !isTestEmail(requesterEmail)) {
                response.status(400).json({
                    success: false,
                    message: 'Invalid or non-test email format'
                });
                return;
            }
            // Generate unique form ID with timestamp and random string
            const timestamp = Date.now();
            const randomString = Math.random().toString(36).substring(2, 15);
            const formId = `${timestamp}-${randomString}`;
            // Create form data
            const formData = {
                companyName,
                sheetName: productName,
                email: requesterEmail,
                status: 'pending',
                department: requestData.department || 'Unassigned',
                reviewers: {},
                createdAt: firestore_2.FieldValue.serverTimestamp(),
                updatedAt: firestore_2.FieldValue.serverTimestamp()
            };
            // Save to Firestore
            const db = (0, firestore_2.getFirestore)();
            yield db.collection('forms').doc(formId).set(formData);
            // Generate form URL with encoded parameters
            const formUrl = new URL(BASE_URL);
            formUrl.searchParams.set('id', formId);
            formUrl.searchParams.set('company', encodeURIComponent(companyName));
            formUrl.searchParams.set('product', encodeURIComponent(productName));
            formUrl.searchParams.set('email', encodeURIComponent(requesterEmail));
            formUrl.searchParams.set('t', timestamp.toString());
            // Create email content
            const emailContent = {
                to: requesterEmail,
                from: FROM_EMAIL,
                subject: `Product Review Form Ready - ${productName}`,
                html: `
          <!DOCTYPE html>
          <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2c3e50;">Product Review Form Ready</h2>
                <p>Hello,</p>
                <p>Your sheet has been processed and a review form has been created for:</p>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                  <p style="margin: 5px 0;"><strong>Company:</strong> ${companyName}</p>
                  <p style="margin: 5px 0;"><strong>Product:</strong> ${productName}</p>
                </div>
                <p>Please click the button below to access your form:</p>
                <div style="text-align: center; margin: 25px 0;">
                  <a href="${formUrl.toString()}" 
                     style="background-color: #007bff; 
                            color: white; 
                            padding: 12px 24px; 
                            text-decoration: none; 
                            border-radius: 5px; 
                            display: inline-block;">
                    Access Review Form
                  </a>
                </div>
                <p style="font-size: 0.9em; color: #666;">
                  If the button doesn't work, you can copy and paste this link into your browser:
                  <br>
                  <span style="color: #007bff;">${formUrl.toString()}</span>
                </p>
                <hr style="border: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 0.8em; color: #666;">
                  This is an automated message. Please do not reply to this email.
                </p>
              </div>
            </body>
          </html>
        `
            };
            try {
                yield sgMail.send(emailContent);
            }
            catch (emailError) {
                console.error('SendGrid email failed:', emailError);
                // Fallback to Firebase Email Extension
                yield db.collection('mail').add({
                    to: requesterEmail,
                    message: {
                        subject: emailContent.subject,
                        html: emailContent.html
                    }
                });
            }
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
                message: validationError instanceof Error ? validationError.message : 'Validation failed'
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
}));
exports.sendReviewEmails = (0, firestore_1.onDocumentUpdated)({
    document: 'forms/{formId}',
    region: 'europe-west1'
}, (event) => __awaiter(void 0, void 0, void 0, function* () {
    if (!event.data)
        return;
    const newData = event.data.after.data();
    const previousData = event.data.before.data();
    if (!newData || !previousData)
        return;
    const formId = event.params.formId;
    // Get all reviewer roles that were just assigned (email changed from empty to a value)
    const reviewerRoles = ['qualityControl', 'safetyOfficer', 'productionManager', 'environmentalOfficer'];
    const newlyAssignedReviewers = reviewerRoles.filter(role => {
        var _a, _b, _c, _d;
        const prevEmail = ((_b = (_a = previousData.reviewers) === null || _a === void 0 ? void 0 : _a[role]) === null || _b === void 0 ? void 0 : _b.email) || '';
        const newEmail = ((_d = (_c = newData.reviewers) === null || _c === void 0 ? void 0 : _c[role]) === null || _d === void 0 ? void 0 : _d.email) || '';
        return !prevEmail && newEmail;
    });
    // Send emails to newly assigned reviewers
    for (const role of newlyAssignedReviewers) {
        const reviewerEmail = newData.reviewers[role].email;
        const roleTitle = role
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase());
        const emailContent = {
            to: reviewerEmail,
            from: FROM_EMAIL,
            subject: `Review Required (${roleTitle}) - ${newData.sheetName}`,
            html: `
                <!DOCTYPE html>
                <html>
                  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                      <h2 style="color: #2c3e50;">Review Required - ${roleTitle}</h2>
                      <p>You have been assigned as the ${roleTitle} reviewer for:</p>
                      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                        <p style="margin: 5px 0;"><strong>Product:</strong> ${newData.sheetName}</p>
                        <p style="margin: 5px 0;"><strong>Company:</strong> ${newData.companyName}</p>
                        <p style="margin: 5px 0;"><strong>Submitted By:</strong> ${newData.email}</p>
                      </div>
                      <p>Please review the form and provide your approval or feedback:</p>
                      <div style="text-align: center; margin: 25px 0;">
                        <a href="${BASE_URL}/review-form.html?id=${formId}&role=${role}" 
                           style="background-color: #007bff; 
                                  color: white; 
                                  padding: 12px 24px; 
                                  text-decoration: none; 
                                  border-radius: 5px; 
                                  display: inline-block;">
                          Review Form
                        </a>
                      </div>
                      <hr style="border: 1px solid #eee; margin: 20px 0;">
                      <p style="font-size: 0.8em; color: #666;">
                        This is an automated message. Please do not reply to this email.
                      </p>
                    </div>
                  </body>
                </html>
            `
        };
        try {
            yield sgMail.send(emailContent);
            console.log(`Review notification sent to ${roleTitle} (${reviewerEmail})`);
        }
        catch (error) {
            console.error(`Error sending email to ${roleTitle}:`, error);
            // Fallback to Firebase Email Extension
            const db = (0, firestore_2.getFirestore)();
            yield db.collection('mail').add({
                to: reviewerEmail,
                message: {
                    subject: emailContent.subject,
                    html: emailContent.html
                }
            });
        }
    }
}));
exports.updateFormStatus = (0, firestore_1.onDocumentUpdated)({
    document: 'forms/{formId}',
    region: 'europe-west1'
}, (event) => __awaiter(void 0, void 0, void 0, function* () {
    if (!event.data)
        return;
    const newData = event.data.after.data();
    const previousData = event.data.before.data();
    if (!newData || !previousData)
        return;
    const formId = event.params.formId;
    // Get all reviewer statuses
    const reviewerRoles = ['qualityControl', 'safetyOfficer', 'productionManager', 'environmentalOfficer'];
    const reviewStatuses = reviewerRoles.map(role => {
        var _a, _b;
        return ({
            role,
            status: ((_a = newData.reviewers[role]) === null || _a === void 0 ? void 0 : _a.status) || 'pending',
            email: ((_b = newData.reviewers[role]) === null || _b === void 0 ? void 0 : _b.email) || ''
        });
    });
    // Check if all assigned reviewers have responded
    const assignedReviewers = reviewStatuses.filter(r => r.email !== '');
    const pendingReviews = assignedReviewers.filter(r => r.status === 'pending');
    const rejectedReviews = assignedReviewers.filter(r => r.status === 'rejected');
    let newStatus = newData.status;
    // Update form status based on review statuses
    if (rejectedReviews.length > 0) {
        newStatus = 'rejected';
    }
    else if (pendingReviews.length === 0 && assignedReviewers.length > 0) {
        newStatus = 'approved';
    }
    else if (assignedReviewers.length > 0 && pendingReviews.length < assignedReviewers.length) {
        newStatus = 'in_review';
    }
    // Only update if status has changed
    if (newStatus !== newData.status) {
        const db = (0, firestore_2.getFirestore)();
        yield db.collection('forms').doc(formId).update({
            status: newStatus,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        // Send notification email to form creator if form is approved or rejected
        if (newStatus === 'approved' || newStatus === 'rejected') {
            const emailContent = {
                to: newData.email,
                from: FROM_EMAIL,
                subject: `Form ${newStatus.toUpperCase()} - ${newData.sheetName}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                          <h2 style="color: #2c3e50;">Form ${newStatus.toUpperCase()}</h2>
                          <p>Your form has been ${newStatus}:</p>
                          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                            <p style="margin: 5px 0;"><strong>Product:</strong> ${newData.sheetName}</p>
                            <p style="margin: 5px 0;"><strong>Company:</strong> ${newData.companyName}</p>
                          </div>
                          <h3>Review Status:</h3>
                          <ul>
                            ${reviewStatuses
                    .filter(r => r.email)
                    .map(r => {
                    var _a;
                    return `
                                    <li>
                                        <strong>${r.role.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</strong> 
                                        ${r.status.toUpperCase()}
                                        ${((_a = newData.reviewers[r.role]) === null || _a === void 0 ? void 0 : _a.comments) ?
                        `<br><em>Comments: ${newData.reviewers[r.role].comments}</em>` :
                        ''}
                                    </li>
                                `;
                }).join('')}
                          </ul>
                          <div style="text-align: center; margin: 25px 0;">
                            <a href="${BASE_URL}/review-form.html?id=${formId}" 
                               style="background-color: #007bff; 
                                      color: white; 
                                      padding: 12px 24px; 
                                      text-decoration: none; 
                                      border-radius: 5px; 
                                      display: inline-block;">
                              View Form
                            </a>
                          </div>
                        </div>
                      </body>
                    </html>
                `
            };
            try {
                yield sgMail.send(emailContent);
            }
            catch (error) {
                console.error('Error sending status update email:', error);
                yield db.collection('mail').add({
                    to: newData.email,
                    message: {
                        subject: emailContent.subject,
                        html: emailContent.html
                    }
                });
            }
        }
    }
}));
exports.submitReviewDecision = (0, https_1.onRequest)({
    region: 'europe-west1',
    maxInstances: 10,
    cors: true
}, (request, response) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (request.method !== 'POST') {
            response.status(405).json({
                success: false,
                message: 'Method not allowed'
            });
            return;
        }
        const { formId, role, decision, comments } = request.body;
        const reviewerEmail = request.body.email;
        if (!formId || !role || !decision || !reviewerEmail) {
            response.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
            return;
        }
        // Validate decision
        if (!['approved', 'rejected'].includes(decision)) {
            response.status(400).json({
                success: false,
                message: 'Invalid decision. Must be "approved" or "rejected"'
            });
            return;
        }
        // Validate role
        const validRoles = ['qualityControl', 'safetyOfficer', 'productionManager', 'environmentalOfficer'];
        if (!validRoles.includes(role)) {
            response.status(400).json({
                success: false,
                message: 'Invalid role'
            });
            return;
        }
        const db = (0, firestore_2.getFirestore)();
        const formRef = db.collection('forms').doc(formId);
        const formDoc = yield formRef.get();
        if (!formDoc.exists) {
            response.status(404).json({
                success: false,
                message: 'Form not found'
            });
            return;
        }
        const formData = formDoc.data();
        // Verify reviewer is assigned to this role
        if (((_a = formData.reviewers[role]) === null || _a === void 0 ? void 0 : _a.email) !== reviewerEmail) {
            response.status(403).json({
                success: false,
                message: 'You are not authorized to review this form in this role'
            });
            return;
        }
        // Update the reviewer's status
        const updateData = {
            [`reviewers.${role}.status`]: decision,
            [`reviewers.${role}.timestamp`]: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        if (comments) {
            updateData[`reviewers.${role}.comments`] = comments;
        }
        yield formRef.update(updateData);
        response.status(200).json({
            success: true,
            message: `Review ${decision} successfully recorded`
        });
    }
    catch (error) {
        console.error('Error processing review decision:', error);
        response.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));
// Add this new function to handle review notifications
exports.handleReviewNotifications = (0, firestore_1.onDocumentUpdated)({
    document: 'forms/{formId}',
    region: 'europe-west1'
}, (event) => __awaiter(void 0, void 0, void 0, function* () {
    const newData = event.data.after.data();
    const previousData = event.data.before.data();
    const formId = event.params.formId;
    // Check if review was just initiated
    if (newData.status === 'review_initiated' && previousData.status !== 'review_initiated') {
        // Send emails to all reviewers
        const reviewers = newData.reviewers;
        for (const [role, email] of Object.entries(reviewers)) {
            if (!email)
                continue;
            const emailContent = {
                to: email,
                from: FROM_EMAIL,
                subject: `Review Required: ${newData.sheetName}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                          <h2 style="color: #2c3e50;">Review Required</h2>
                          <p>You have been assigned as the ${role} reviewer for:</p>
                          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                            <p style="margin: 5px 0;"><strong>Product:</strong> ${newData.sheetName}</p>
                            <p style="margin: 5px 0;"><strong>Company:</strong> ${newData.companyName}</p>
                          </div>
                          <p>Please review and approve or reject this form.</p>
                          <div style="text-align: center; margin: 25px 0;">
                            <a href="${BASE_URL}/index.html?id=${formId}" 
                               style="background-color: #007bff; 
                                      color: white; 
                                      padding: 12px 24px; 
                                      text-decoration: none; 
                                      border-radius: 5px; 
                                      display: inline-block;">
                              Review Form
                            </a>
                          </div>
                        </div>
                      </body>
                    </html>
                `
            };
            try {
                yield sgMail.send(emailContent);
                console.log(`Review notification sent to ${role} (${email})`);
            }
            catch (error) {
                console.error(`Error sending email to ${role}:`, error);
                // Fallback to Firebase Email Extension
                const db = (0, firestore_2.getFirestore)();
                yield db.collection('mail').add({
                    to: email,
                    message: {
                        subject: emailContent.subject,
                        html: emailContent.html
                    }
                });
            }
        }
    }
    // Check for approval status changes
    if (newData.approvals) {
        const newApprovals = Object.entries(newData.approvals)
            .filter(([_, approval]) => approval.status === 'approved')
            .length;
        const previousApprovals = Object.entries(previousData.approvals || {})
            .filter(([_, approval]) => approval.status === 'approved')
            .length;
        // If all reviewers have approved, send notification to form creator
        if (newApprovals === Object.keys(newData.reviewers).length &&
            newApprovals > previousApprovals) {
            const emailContent = {
                to: newData.email,
                from: FROM_EMAIL,
                subject: `Form Approved: ${newData.sheetName}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                          <h2 style="color: #2c3e50;">Form Approved</h2>
                          <p>Your form has been approved by all reviewers:</p>
                          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                            <p style="margin: 5px 0;"><strong>Product:</strong> ${newData.sheetName}</p>
                            <p style="margin: 5px 0;"><strong>Company:</strong> ${newData.companyName}</p>
                          </div>
                          <div style="text-align: center; margin: 25px 0;">
                            <a href="${BASE_URL}/index.html?id=${formId}" 
                               style="background-color: #007bff; 
                                      color: white; 
                                      padding: 12px 24px; 
                                      text-decoration: none; 
                                      border-radius: 5px; 
                                      display: inline-block;">
                              View Form
                            </a>
                          </div>
                        </div>
                      </body>
                    </html>
                `
            };
            try {
                yield sgMail.send(emailContent);
            }
            catch (error) {
                console.error('Error sending approval notification:', error);
                const db = (0, firestore_2.getFirestore)();
                yield db.collection('mail').add({
                    to: newData.email,
                    message: {
                        subject: emailContent.subject,
                        html: emailContent.html
                    }
                });
            }
        }
    }
}));
// Add this test function
exports.testSendGrid = testSendGrid;
