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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNewReviewForm = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const admin = __importStar(require("firebase-admin"));
const mail_1 = __importDefault(require("@sendgrid/mail"));
// Initialize Firebase Admin
admin.initializeApp();
// Initialize SendGrid with API key from environment variable
const sendgridKey = process.env.SENDGRID_API_KEY;
if (!sendgridKey) {
    logger.warn("SendGrid API key is not configured in environment");
}
else {
    try {
        mail_1.default.setApiKey(sendgridKey);
        logger.info("SendGrid API key configured successfully");
    }
    catch (error) {
        logger.error("Error configuring SendGrid:", error);
    }
}
exports.createNewReviewForm = (0, https_1.onRequest)({
    memory: "256MiB",
    timeoutSeconds: 60,
    minInstances: 0,
    maxInstances: 100,
    region: "us-central1",
    cors: true,
    secrets: ["SENDGRID_API_KEY"]
}, async (request, response) => {
    // Set CORS headers for all responses
    response.set('Access-Control-Allow-Origin', '*');
    response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === "OPTIONS") {
        response.status(204).send("");
        return;
    }
    if (request.method !== "POST") {
        response.status(405).json({
            success: false,
            error: "Method not allowed"
        });
        return;
    }
    try {
        // Verify SendGrid configuration
        if (!sendgridKey) {
            throw new Error("SendGrid API key is not configured in environment");
        }
        const { productName, adminEmail, reviewers, } = request.body;
        // Validate required fields
        if (!productName || !adminEmail || !Array.isArray(reviewers)) {
            throw new Error("Missing required fields: productName, adminEmail, and reviewers array");
        }
        // Log the request
        logger.info("Creating new form", {
            productName,
            adminEmail,
            reviewersCount: reviewers.length,
        });
        // Create reviewers array with roles
        const reviewersWithRoles = [
            {
                email: adminEmail,
                role: "admin",
                hasSigned: false,
            },
            ...reviewers.map((email) => ({
                email,
                role: "reviewer",
                hasSigned: false,
            })),
        ];
        // Create Firestore document
        const formRef = await admin.firestore().collection("productReviews").add({
            productName,
            adminEmail,
            reviewers: reviewersWithRoles,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: "pending",
        });
        // Generate form URLs
        const baseUrl = "https://stacksdata.com/sappi-review";
        const formUrl = `${baseUrl}?id=${formRef.id}`;
        const adminUrl = `${formUrl}&admin=true`;
        try {
            // Send email to admin
            await mail_1.default.send({
                to: adminEmail,
                from: "admin@stacksdata.com",
                subject: `New Product Review Form: ${productName}`,
                html: `
            <h2>New Product Review Form Created</h2>
            <p>A new product review form has been created for: ${productName}</p>
            <p>Click here to access the form (admin view): 
               <a href="${adminUrl}">${adminUrl}</a></p>
            <p>The following reviewers have been notified:</p>
            <ul>
                ${reviewers.map((email) => `<li>${email}</li>`).join("")}
            </ul>
          `,
            });
            // Send emails to reviewers
            await Promise.all(reviewers.map((email) => mail_1.default.send({
                to: email,
                from: "admin@stacksdata.com",
                subject: `Product Review Required: ${productName}`,
                html: `
              <h2>Product Review Required</h2>
              <p>You have been requested to review: ${productName}</p>
              <p>Click here to access the form: 
                 <a href="${formUrl}">${formUrl}</a></p>
            `,
            })));
            logger.info("Emails sent successfully");
        }
        catch (emailError) {
            logger.error("Error sending emails:", emailError);
            // Continue execution even if emails fail
        }
        response.status(200).json({
            success: true,
            message: "Form created successfully",
            formId: formRef.id,
        });
    }
    catch (error) {
        logger.error("Error creating form:", error);
        response.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
        });
    }
});
//# sourceMappingURL=index.js.map