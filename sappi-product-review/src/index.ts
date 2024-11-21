/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";

// Initialize Firebase Admin
admin.initializeApp();

// Types for our request body
interface CreateFormRequest {
    productName: string;
    adminEmail: string;
    reviewers: string[];
}

interface Reviewer {
    email: string;
    role: "admin" | "reviewer";
    hasSigned: boolean;
}

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "admin@stacksdata.com",
    pass: "vmqg bfju cvdw guvq"
  },
});

export const createNewReviewForm = onRequest(async (request, response) => {
  // Enable CORS
  response.set("Access-Control-Allow-Origin", "*");

  if (request.method === "OPTIONS") {
    response.set("Access-Control-Allow-Methods", "POST");
    response.set("Access-Control-Allow-Headers", "Content-Type");
    response.status(204).send("");
    return;
  }

  try {
    const {
      productName,
      adminEmail,
      reviewers,
    } = request.body as CreateFormRequest;

    // Log the request
    logger.info("Creating new form", {
      productName,
      adminEmail,
      reviewersCount: reviewers.length,
    });

    // Create new form document
    const formRef = await admin
      .firestore()
      .collection("forms")
      .add({
        status: "pending",
        productName,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        adminEmail,
        reviewers: [
          {email: adminEmail, role: "admin" as const, hasSigned: false},
          ...reviewers.map((email) => ({
            email,
            role: "reviewer" as const,
            hasSigned: false,
          })),
        ] as Reviewer[],
        formData: {},
        signatures: {},
      });

    const baseUrl = "https://stacks-companion-68225.web.app/review-form.html";
    const formUrl = `${baseUrl}?id=${formRef.id}`;
    const adminUrl = `${formUrl}&admin=true`;

    // Send email to admin
    await transporter.sendMail({
      from: "admin@stacksdata.com",
      to: adminEmail,
      subject: `New Product Review Form: ${productName}`,
      html: `
                <h2>New Product Review Form Created</h2>
                <p>A new product review form has been created for: 
                   ${productName}</p>
                <p>Click here to access the form (admin view): 
                   <a href="${adminUrl}">${adminUrl}</a></p>
                <p>The following reviewers have been notified:</p>
                <ul>
                    ${reviewers.map((email) => `<li>${email}</li>`).join("")}
                </ul>
            `,
    });

    // Send emails to reviewers
    const reviewerEmails = reviewers.map(async (email) => {
      return transporter.sendMail({
        from: "admin@stacksdata.com",
        to: email,
        subject: `Product Review Required: ${productName}`,
        html: `
                    <h2>Product Review Required</h2>
                    <p>You have been requested to review: ${productName}</p>
                    <p>Click here to access the form: 
                       <a href="${formUrl}">${formUrl}</a></p>
                `,
      });
    });

    await Promise.all(reviewerEmails);

    logger.info("Form created successfully", {formId: formRef.id});

    response.json({
      success: true,
      formId: formRef.id,
      message: "Form created and notifications sent",
    });
  } catch (error) {
    logger.error("Error creating form", error);
    response.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
