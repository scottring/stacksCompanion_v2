import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { MailService } from '@sendgrid/mail';
import cors = require('cors');
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { testSendGrid } from './test-sendgrid';

// Initialize SendGrid
const sgMail = new MailService();

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
  reviewers: {
    [key: string]: {
      email: string;
    };
  };
  approvals?: {
    [key: string]: {
      status: string;
    };
  };
  email?: string;
  sheetName?: string;
  companyName?: string;
  status?: string;
}

interface ReviewerApproval {
  status: string;
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

// Add this configuration object
const functionConfig = {
    region: 'europe-west1',
    secrets: ['SENDGRID_API_KEY']
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
        sheetName: productName,
        email: requesterEmail,
        status: 'pending',
        reviewers: {},
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
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

export const sendReviewEmails = onDocumentUpdated({
    document: 'forms/{formId}',
    region: 'europe-west1'
}, async (event) => {
    if (!event.data) return;
    
    const newData = event.data.after.data();
    const previousData = event.data.before.data();
    if (!newData || !previousData) return;
    
    const formId = event.params.formId;

    // Get all reviewer roles that were just assigned (email changed from empty to a value)
    const reviewerRoles = ['qualityControl', 'safetyOfficer', 'productionManager', 'environmentalOfficer'];
    const newlyAssignedReviewers = reviewerRoles.filter(role => {
        const prevEmail = previousData.reviewers?.[role]?.email || '';
        const newEmail = newData.reviewers?.[role]?.email || '';
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
            await sgMail.send(emailContent);
            console.log(`Review notification sent to ${roleTitle} (${reviewerEmail})`);
        } catch (error) {
            console.error(`Error sending email to ${roleTitle}:`, error);
            // Fallback to Firebase Email Extension
            const db = getFirestore();
            await db.collection('mail').add({
                to: reviewerEmail,
                message: {
                    subject: emailContent.subject,
                    html: emailContent.html
                }
            });
        }
    }
});

export const updateFormStatus = onDocumentUpdated({
    document: 'forms/{formId}',
    region: 'europe-west1'
}, async (event) => {
    if (!event.data) return;
    
    const newData = event.data.after.data();
    const previousData = event.data.before.data();
    if (!newData || !previousData) return;
    
    const formId = event.params.formId;

    // Get all reviewer statuses
    const reviewerRoles = ['qualityControl', 'safetyOfficer', 'productionManager', 'environmentalOfficer'];
    const reviewStatuses = reviewerRoles.map(role => ({
        role,
        status: newData.reviewers[role]?.status || 'pending',
        email: newData.reviewers[role]?.email || ''
    }));

    // Check if all assigned reviewers have responded
    const assignedReviewers = reviewStatuses.filter(r => r.email !== '');
    const pendingReviews = assignedReviewers.filter(r => r.status === 'pending');
    const rejectedReviews = assignedReviewers.filter(r => r.status === 'rejected');

    let newStatus = newData.status;
    
    // Update form status based on review statuses
    if (rejectedReviews.length > 0) {
        newStatus = 'rejected';
    } else if (pendingReviews.length === 0 && assignedReviewers.length > 0) {
        newStatus = 'approved';
    } else if (assignedReviewers.length > 0 && pendingReviews.length < assignedReviewers.length) {
        newStatus = 'in_review';
    }

    // Only update if status has changed
    if (newStatus !== newData.status) {
        const db = getFirestore();
        await db.collection('forms').doc(formId).update({
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
                                .map(r => `
                                    <li>
                                        <strong>${r.role.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</strong> 
                                        ${r.status.toUpperCase()}
                                        ${newData.reviewers[r.role]?.comments ? 
                                            `<br><em>Comments: ${newData.reviewers[r.role].comments}</em>` : 
                                            ''}
                                    </li>
                                `).join('')}
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
                await sgMail.send(emailContent);
            } catch (error) {
                console.error('Error sending status update email:', error);
                await db.collection('mail').add({
                    to: newData.email,
                    message: {
                        subject: emailContent.subject,
                        html: emailContent.html
                    }
                });
            }
        }
    }
});

export const submitReviewDecision = onRequest({
    region: 'europe-west1',
    maxInstances: 1,
    secrets: ['SENDGRID_API_KEY']
}, async (request, response) => {
    try {
        const { formId, role, reviewerEmail, decision, comments } = request.body;

        if (!formId || !role || !reviewerEmail || !decision) {
            response.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
            return;
        }

        const db = getFirestore();
        const formRef = db.collection('forms').doc(formId);
        const formDoc = await formRef.get();
        
        if (!formDoc.exists) {
            response.status(404).json({
                success: false,
                message: 'Form not found'
            });
            return;
        }

        const formData = formDoc.data() as FormData;
        
        // Verify reviewer is assigned to this role
        if (!formData?.reviewers?.[role]?.email || formData.reviewers[role].email !== reviewerEmail) {
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

        await formRef.update(updateData);

        response.status(200).json({
            success: true,
            message: `Review ${decision} successfully recorded`
        });

    } catch (error) {
        console.error('Error submitting review decision:', error);
        response.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Add this new function to handle review notifications
export const handleReviewNotifications = onDocumentUpdated({
    document: 'forms/{formId}',
    region: 'europe-west1'
}, async (event) => {
    if (!event.data) {
        console.error('No event data available');
        return;
    }

    const newData = event.data.after.data() as FormData | undefined;
    const previousData = event.data.before.data() as FormData | undefined;
    
    if (!newData || !previousData) {
        console.error('Missing data in event');
        return;
    }

    const formId = event.params.formId;

    // Check if review was just initiated
    if (newData.status === 'review_initiated' && previousData.status !== 'review_initiated') {
        // Send emails to all reviewers
        const reviewers = newData.reviewers;
        for (const [role, reviewer] of Object.entries(reviewers)) {
            if (!reviewer.email) continue;

            const emailContent = {
                to: reviewer.email,
                from: FROM_EMAIL,
                subject: `Review Required: ${newData.sheetName || ''}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                          <h2 style="color: #2c3e50;">Review Required</h2>
                          <p>You have been assigned as the ${role} reviewer for:</p>
                          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                            <p style="margin: 5px 0;"><strong>Product:</strong> ${newData.sheetName || ''}</p>
                            <p style="margin: 5px 0;"><strong>Company:</strong> ${newData.companyName || ''}</p>
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
                await sgMail.send(emailContent);
                console.log(`Review notification sent to ${role} (${reviewer.email})`);
            } catch (error) {
                console.error(`Error sending email to ${role}:`, error);
                // Fallback to Firebase Email Extension
                const db = getFirestore();
                await db.collection('mail').add({
                    to: reviewer.email,
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
            .filter(([_, approval]: [string, ReviewerApproval]) => approval.status === 'approved')
            .length;
        const previousApprovals = Object.entries(previousData.approvals || {})
            .filter(([_, approval]: [string, ReviewerApproval]) => approval.status === 'approved')
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
                await sgMail.send(emailContent);
            } catch (error) {
                console.error('Error sending approval notification:', error);
                const db = getFirestore();
                await db.collection('mail').add({
                    to: newData.email,
                    message: {
                        subject: emailContent.subject,
                        html: emailContent.html
                    }
                });
            }
        }
    }
});

// Export the testSendGrid function
export { testSendGrid };
