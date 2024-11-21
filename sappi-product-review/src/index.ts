import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import sgMail from "@sendgrid/mail";

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

// Initialize SendGrid with API key from environment variable
const sendgridKey = process.env.SENDGRID_API_KEY;
if (!sendgridKey) {
  logger.warn("SendGrid API key is not configured in environment");
} else {
  try {
    sgMail.setApiKey(sendgridKey);
    logger.info("SendGrid API key configured successfully");
  } catch (error) {
    logger.error("Error configuring SendGrid:", error);
  }
}

export const createNewReviewForm = onRequest({
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

      const {
        productName,
        adminEmail,
        reviewers,
      } = request.body as CreateFormRequest;

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
      const reviewersWithRoles: Reviewer[] = [
        {
          email: adminEmail,
          role: "admin" as const,
          hasSigned: false,
        },
        ...reviewers.map((email) => ({
          email,
          role: "reviewer" as const,
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
        await sgMail.send({
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
        await Promise.all(reviewers.map((email) => 
          sgMail.send({
            to: email,
            from: "admin@stacksdata.com",
            subject: `Product Review Required: ${productName}`,
            html: `
              <h2>Product Review Required</h2>
              <p>You have been requested to review: ${productName}</p>
              <p>Click here to access the form: 
                 <a href="${formUrl}">${formUrl}</a></p>
            `,
          })
        ));

        logger.info("Emails sent successfully");
      } catch (emailError) {
        logger.error("Error sending emails:", emailError);
        // Continue execution even if emails fail
      }

      response.status(200).json({
        success: true,
        message: "Form created successfully",
        formId: formRef.id,
      });
    } catch (error) {
      logger.error("Error creating form:", error);
      response.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  });
