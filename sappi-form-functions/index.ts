import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as sgMail from '@sendgrid/mail';
import cors = require('cors');

// Initialize Firebase Admin only if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

// TypeScript interfaces
interface SheetRequest {
  "Sheet's Company Name"?: string;
  "Sheet&#39;s Company Name"?: string;
  "Sheet's Product Name"?: string;
  "Sheet&#39;s Product Name"?: string;
  "Sheet Creator's Email"?: string;
  "Sheet Creator&#39;s Email"?: string;
  [key: string]: string | undefined;
}

interface FormData {
  companyName: string;
  productName: string;
  requesterEmail: string;
  status: 'pending' | 'in-progress' | 'completed';
  department?: string;
  reviewers: string[];
  signatures: Record<string, boolean>;
  createdAt: FieldValue;
  metadata?: {
    createdVia: string;
    timestamp: number;
    lastUpdated?: number;
  };
}

// Field name normalization helper
const normalizeFieldName = (data: SheetRequest, originalField: string, encodedField: string): string => {
  const value = data[originalField] || data[encodedField];
  if (!value) {
    throw new Error(`Missing required field: ${originalField}`);
  }
  return value.trim();
};

// Email template interface
interface EmailTemplate {
  to: string;
  from: string;
  subject: string;
  html: string;
}

// Constants
const BASE_URL = 'https://internal-review.stacksdata.com';
const FROM_EMAIL = 'admin@stacksdata.com';

// Initialize cors middleware
const corsMiddleware = cors({ origin: true });

// Add these test email patterns to your validation
const isTestEmail = (email: string): boolean => {
  return email.endsWith('@example.com') || 
         email.includes('+test@') ||
         email.endsWith('@mailinator.com');
};

// Main function
export const createFormFromSheet = onRequest({
  region: 'europe-west1',
  maxInstances: 10,
  secrets: ['SENDGRID_API_KEY']
}, async (request, response) => {
  // Handle CORS
  await new Promise<void>((resolve) => corsMiddleware(request, response, () => resolve()));
  console.log('request.body', request.body)

  try {
    // Validate SendGrid configuration
    const sendGridKey = process.env.SENDGRID_API_KEY;
    if (!sendGridKey?.startsWith('SG.')) {
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
      const requestData = request.body as SheetRequest;
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
      const formData: FormData = {
        companyName,
        productName,
        requesterEmail,
        status: 'pending',
        department: requestData.department || 'Unassigned',
        reviewers: [],
        signatures: {},
        createdAt: FieldValue.serverTimestamp(),
        metadata: {
          createdVia: 'sheet-integration',
          timestamp,
          lastUpdated: timestamp
        }
      };

      // Save to Firestore
      const db = getFirestore();
      await db.collection('forms').doc(formId).set(formData);

      // Generate form URL with encoded parameters
      const formUrl = new URL(BASE_URL);
      formUrl.searchParams.set('id', formId);
      formUrl.searchParams.set('company', encodeURIComponent(companyName));
      formUrl.searchParams.set('product', encodeURIComponent(productName));
      formUrl.searchParams.set('email', encodeURIComponent(requesterEmail));
      formUrl.searchParams.set('t', timestamp.toString());

      // Create email content
      const emailContent: EmailTemplate = {
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
        await sgMail.send(emailContent);
      } catch (emailError) {
        console.error('SendGrid email failed:', emailError);
        // Fallback to Firebase Email Extension
        await db.collection('mail').add({
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

    } catch (validationError) {
      console.error('Validation error:', validationError);
      response.status(400).json({
        success: false,
        message: validationError instanceof Error ? validationError.message : 'Validation failed'
      });
      return;
    }

  } catch (error) {
    console.error('Error processing request:', error);
    response.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return;
  }
});
