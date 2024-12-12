const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');

admin.initializeApp();

// Constants
const FROM_EMAIL = 'admin@stacksdata.com';

exports.sendReviewEmails = functions.firestore
    .document('forms/{formId}')
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const previousData = change.before.data();
        
        // Check if this is a review initiation
        if (!newData.emailTrigger || newData.emailTrigger.type !== 'INITIATE_REVIEW') {
            return null;
        }

        // Check if we've already processed this trigger
        if (previousData.emailTrigger && 
            previousData.emailTrigger.timestamp === newData.emailTrigger.timestamp) {
            return null;
        }

        // Validate SendGrid configuration
        const sendGridKey = process.env.SENDGRID_API_KEY;
        if (!sendGridKey?.startsWith('SG.')) {
            console.error('Invalid SendGrid API key configuration');
            return null;
        }
        sgMail.setApiKey(sendGridKey);

        const formId = context.params.formId;
        const reviewers = newData.emailTrigger.reviewers;
        const formUrl = `/?product=${encodeURIComponent(newData.sheetName)}&company=${encodeURIComponent(newData.companyName)}&id=${formId}`;

        // Prepare emails for all reviewers
        const emailPromises = reviewers.map(async (reviewer) => {
            const msg = {
                to: reviewer.email,
                from: FROM_EMAIL,
                subject: `Review Required: ${newData.sheetName}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                                <h2 style="color: #2c3e50;">Product Review Required</h2>
                                <p>Hello ${reviewer.name},</p>
                                <p>You have been assigned as the <strong>${reviewer.role}</strong> for reviewing:</p>
                                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                                    <p style="margin: 5px 0;"><strong>Product:</strong> ${newData.sheetName}</p>
                                    <p style="margin: 5px 0;"><strong>Company:</strong> ${newData.companyName}</p>
                                </div>
                                <p>Please click the button below to access and review the form:</p>
                                <div style="text-align: center; margin: 25px 0;">
                                    <a href="${formUrl}" 
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
                                    <span style="color: #007bff;">${formUrl}</span>
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
                await sgMail.send(msg);
                console.log(`Email sent to ${reviewer.email}`);
            } catch (error) {
                console.error(`Error sending email to ${reviewer.email}:`, error);
                // Fallback to Firebase Email Extension
                const db = admin.firestore();
                await db.collection('mail').add({
                    to: reviewer.email,
                    message: {
                        subject: msg.subject,
                        html: msg.html
                    }
                });
            }
        });

        try {
            await Promise.all(emailPromises);
            
            // Clear the email trigger after successful sending
            await change.after.ref.update({
                'emailTrigger': admin.firestore.FieldValue.delete()
            });
            
            return { success: true };
        } catch (error) {
            console.error('Error sending emails:', error);
            throw error;
        }
    }); 