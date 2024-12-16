const { onRequest } = require('firebase-functions/v2/https');
const { MailService } = require('@sendgrid/mail');
const { getFirestore } = require('firebase-admin/firestore');
const { initializeApp, getApps } = require('firebase-admin/app');

// Initialize Firebase Admin
if (getApps().length === 0) {
    initializeApp();
}

// Initialize SendGrid
const sgMail = new MailService();

// Constants
const FROM_EMAIL = 'admin@stacksdata.com';
const BASE_URL = 'https://stacks-companion-68225.web.app';

exports.testReviewerEmails = onRequest({
    region: 'europe-west1',
    maxInstances: 1,
    secrets: ['SENDGRID_API_KEY'],
    invoker: 'public'
}, async (request, response) => {
    try {
        // Validate SendGrid configuration
        const sendGridKey = process.env.SENDGRID_API_KEY;
        if (!sendGridKey?.startsWith('SG.')) {
            throw new Error('Invalid SendGrid API key configuration');
        }
        sgMail.setApiKey(sendGridKey);

        // Create a test form document
        const db = getFirestore();
        const formId = `test-form-${Date.now()}`;
        const testForm = {
            sheetName: 'Test Product',
            companyName: 'Test Company',
            status: 'review_initiated',
            reviewers: {
                qualityControl: { 
                    email: 'smkaufman+qc@gmail.com',
                    name: 'Quality Control Reviewer'
                },
                safetyOfficer: { 
                    email: 'smkaufman+safety@gmail.com',
                    name: 'Safety Officer'
                },
                productionManager: { 
                    email: 'smkaufman+prod@gmail.com',
                    name: 'Production Manager'
                },
                environmentalOfficer: { 
                    email: 'smkaufman+env@gmail.com',
                    name: 'Environmental Officer'
                }
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Store the test form
        await db.collection('forms').doc(formId).set(testForm);

        // Send emails to all reviewers
        const emailPromises = Object.entries(testForm.reviewers).map(async ([role, reviewer]) => {
            const roleTitle = role
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, str => str.toUpperCase());

            const emailContent = {
                to: reviewer.email,
                from: FROM_EMAIL,
                subject: `Review Required: ${testForm.sheetName}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                          <h2 style="color: #2c3e50;">Review Required</h2>
                          <p>Hello ${reviewer.name},</p>
                          <p>You have been assigned as the ${roleTitle} for:</p>
                          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                            <p style="margin: 5px 0;"><strong>Product:</strong> ${testForm.sheetName}</p>
                            <p style="margin: 5px 0;"><strong>Company:</strong> ${testForm.companyName}</p>
                          </div>
                          <p>Please review and approve or reject this form.</p>
                          <div style="text-align: center; margin: 25px 0;">
                            <a href="${BASE_URL}/?id=${formId}&role=${role}" 
                               style="background-color: #007bff; 
                                      color: white; 
                                      padding: 12px 24px; 
                                      text-decoration: none; 
                                      border-radius: 5px; 
                                      display: inline-block;">
                              Review Form
                            </a>
                          </div>
                          <p style="color: #666; font-size: 0.9em;">This is a test email for the review system.</p>
                        </div>
                      </body>
                    </html>
                `
            };

            try {
                await sgMail.send(emailContent);
                return { role, email: reviewer.email, status: 'sent' };
            } catch (error) {
                console.error(`Error sending email to ${role}:`, error);
                // Fallback to Firebase Email Extension
                await db.collection('mail').add({
                    to: reviewer.email,
                    message: {
                        subject: emailContent.subject,
                        html: emailContent.html
                    }
                });
                return { role, email: reviewer.email, status: 'fallback' };
            }
        });

        const results = await Promise.all(emailPromises);
        
        response.status(200).json({
            success: true,
            message: 'Test reviewer emails sent',
            formId,
            results
        });

    } catch (error) {
        console.error('Test reviewer emails error:', error);
        response.status(500).json({
            success: false,
            message: 'Failed to send test reviewer emails',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}); 