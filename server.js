require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Serve static files from current directory

// Email configuration
const transporter = nodemailer.createTransport({
    // Configure your email service here
    // For example, using Gmail:
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Endpoint to create a new form instance
app.post('/api/create-form', async (req, res) => {
    try {
        const { recipients, bubbleData } = req.body;
        
        // Generate a unique form URL
        const formUrl = `${req.protocol}://${req.get('host')}/form.html?id=${Date.now()}`;
        
        // Send emails to recipients
        await Promise.all(recipients.map(email => {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'New Product Release Form',
                html: `
                    <h2>New Product Release Form</h2>
                    <p>A new product release form requires your attention.</p>
                    <p>Please click the link below to access the form:</p>
                    <a href="${formUrl}">${formUrl}</a>
                `
            };
            
            return transporter.sendMail(mailOptions);
        }));

        res.json({ success: true, formUrl });
    } catch (error) {
        console.error('Error creating form:', error);
        res.status(500).json({ error: 'Failed to create form' });
    }
});

// Endpoint to handle form submissions
app.post('/api/submit-form', async (req, res) => {
    try {
        const formData = req.body;
        
        // Here you could save the form data to a database
        console.log('Received form submission:', formData);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error submitting form:', error);
        res.status(500).json({ error: 'Failed to submit form' });
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
