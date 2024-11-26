import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as sgMail from '@sendgrid/mail';
import * as cors from 'cors';

// Initialize Firebase Admin
initializeApp();

// TypeScript interfaces
interface SheetRequest {
  "Sheet's Company Name"?: string;
  "Sheet&#39;s Company Name"?: string;
  "Sheet's Product Name"?: string;
  "Sheet&#39;s Product Name"?: string;
  "Sheet Creator's Email"?: string;
  "Sheet Creator&#39;s Email"?: string;
  [key: string]: string | undefined;  // Allow for flexible field names
}

interface FormData {
  companyName: string;
  productName: string;
  requesterEmail: string;
  status: 'pending';
  createdAt: FieldValue;
}

// Field name normalization helper
const normalizeFieldName = (data: SheetRequest, originalField: string, encodedField: string): string => {
  const value = data[originalField] || data[encodedField];
  if (!value) {
    throw new Error(`Missing required field: ${originalField}`);
  }
  return value;
};

// Email template interface
interface EmailTemplate {
  to: string;
  from: string;
  subject: string;
  html: string;
}

// Main function
export const createFormFromSheet = onRequest({
  region: 'europe-west1',
  maxInstances: 10,
  secrets: ['SENDGRID_API_KEY']
}, async (req, res) => {
  const corsHandler = cors({ origin: true });

  return corsHandler(req, res, async () => {
    try {
      // Validate SendGrid configuration
      if (!process.env.SENDGRID_API_KEY?.startsWith('SG.')) {
        throw new Error('Invalid SendGrid API key configuration');
      }
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);

      // Validate request method
      if (req.method !== 'POST') {
        return res.status(405).json({
          success: false,
          message: 'Method not allowed'
        });
      }

      // Extract and validate fields with improved error handling
      try {
        const requestData = req.body as SheetRequest;
        const companyName = normalizeFieldName(requestData, "Sheet's Company Name", "Sheet&#39;s Company Name");
        const productName = normalizeFieldName(requestData, "Sheet's Product Name", "Sheet&#39;s Product Name");
        const requesterEmail = normalizeFieldName(requestData, "Sheet Creator's Email", "Sheet Creator&#39;s Email");

        // Generate unique form ID
        const formId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        
        // Create form data with proper typing
        const formData: FormData = {
          companyName,
          productName,
          requesterEmail,
          status: 'pending',
          createdAt: FieldValue.serverTimestamp()
        };

        // Save to Firestore with proper typing
        const db = getFirestore();
        await db.collection('forms').doc(formId).set(formData);

        // Generate form URL with encoded parameters
        const formUrl = new URL('https://internal-review.stacksdata.com');
        formUrl.searchParams.set('id', formId);
        formUrl.searchParams.set('company', companyName);
        formUrl.searchParams.set('product', productName);

        // Create email content with proper typing
        const emailContent: EmailTemplate = {
          to: requesterEmail,
          from: 'admin@stacksdata.com',
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

        return res.status(200).json({
          success: true,
          formUrl: formUrl.toString(),
          formId,
          message: 'Form created and email sent successfully'
        });

      } catch (validationError) {
        return res.status(400).json({
          success: false,
          message: validationError.message
        });
      }

    } catch (error) {
      console.error('Error processing request:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
});