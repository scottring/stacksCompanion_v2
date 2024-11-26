require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Serve static files from current directory

// Initialize Firebase Admin
const serviceAccount = require('./firebase-service-account.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://stacks-companion-68225.firebaseio.com"
});

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Endpoint for Zapier to create a new form instance
app.post('/api/create-form', async (req, res) => {
    try {
        const { companyName, productName, creatorEmail } = req.body;
        
        if (!companyName || !productName || !creatorEmail) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                required: ['companyName', 'productName', 'creatorEmail']
            });
        }
        
        // Generate a unique ID
        const formId = Date.now().toString();
        
        // Save to Firestore
        await admin.firestore().collection('forms').doc(formId).set({
            companyName,
            productName,
            creatorEmail,
            status: 'created',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Create the form URL
        const formUrl = `${req.protocol}://${req.get('host')}/review-form.html?id=${formId}&company=${encodeURIComponent(companyName)}&product=${encodeURIComponent(productName)}&email=${encodeURIComponent(creatorEmail)}`;
        
        // Try to send email using SendGrid
        let emailError;
        try {
            const msg = {
                to: creatorEmail,
                from: process.env.SENDGRID_FROM_EMAIL,
                subject: `Product Release Form for ${productName} - ${companyName}`,
                html: `
                    <h2>Product Release Form Created</h2>
                    <p>A new product release form has been created for:</p>
                    <ul>
                        <li><strong>Company:</strong> ${companyName}</li>
                        <li><strong>Product:</strong> ${productName}</li>
                    </ul>
                    <p>You can access and share the form using this link:</p>
                    <p><a href="${formUrl}">${formUrl}</a></p>
                    <p>Share this link with colleagues who need to collaborate on this form.</p>
                    <p><small>Note: Anyone with this link can access and edit the form.</small></p>
                `
            };

            await sgMail.send(msg);
        } catch (error) {
            console.warn('Email could not be sent:', error);
            emailError = error;
        }
        
        // Send response
        res.json({ 
            success: true,
            formUrl,
            formId,
            message: 'Form created successfully',
            emailStatus: emailError ? 'failed' : 'sent'
        });
        
    } catch (error) {
        console.error('Error creating form:', error);
        res.status(500).json({ 
            error: 'Failed to create form',
            message: error.message 
        });
    }
});

// Endpoint to handle form submissions
app.post('/api/submit-form', async (req, res) => {
    try {
        const formData = req.body;
        
        // Save to Firestore
        await admin.firestore().collection('forms').doc(formData.formId).update({
            ...formData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'submitted'
        });

        res.json({ 
            success: true,
            message: 'Form submitted successfully'
        });
    } catch (error) {
        console.error('Error submitting form:', error);
        res.status(500).json({ 
            error: 'Failed to submit form',
            message: error.message 
        });
    }
});

// Serve the form HTML for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'form.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
