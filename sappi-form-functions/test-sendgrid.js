"use strict";

const { onRequest } = require('firebase-functions/v2/https');
const { MailService } = require('@sendgrid/mail');

// Initialize SendGrid
const sgMail = new MailService();

// Constants
const FROM_EMAIL = 'admin@stacksdata.com';

exports.testSendGrid = onRequest({
    region: 'europe-west1',
    maxInstances: 1,
    secrets: ['SENDGRID_API_KEY'],
    invoker: 'public'
}, async (request, response) => {
    try {
        const sendGridKey = process.env.SENDGRID_API_KEY;
        console.log('SendGrid key exists:', !!sendGridKey);
        console.log('SendGrid key starts with SG.:', sendGridKey?.startsWith('SG.'));

        if (!sendGridKey?.startsWith('SG.')) {
            throw new Error('Invalid SendGrid API key configuration');
        }

        sgMail.setApiKey(sendGridKey);

        const testEmail = {
            to: 'smkaufman+1@gmail.com',
            from: FROM_EMAIL,
            subject: 'SendGrid Test Email',
            text: 'This is a test email from SendGrid',
            html: `
                <h1>SendGrid Configuration Test</h1>
                <p>If you receive this email, your SendGrid configuration is working correctly.</p>
                <p>Timestamp: ${new Date().toISOString()}</p>
            `
        };

        await sgMail.send(testEmail);
        
        response.status(200).json({
            success: true,
            message: 'Test email sent successfully'
        });
    } catch (error) {
        console.error('SendGrid test error:', error);
        response.status(500).json({
            success: false,
            message: 'SendGrid test failed',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
