function initializeBubbleForm() {
    // Function to populate form fields from URL parameters
    function populateFormFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const companyName = urlParams.get('company');
        const productName = urlParams.get('product');
        const creatorEmail = urlParams.get('email');
        const formId = urlParams.get('id');

        if (companyName) {
            document.getElementById('companyName').value = decodeURIComponent(companyName);
        }
        if (productName) {
            document.getElementById('productName').value = decodeURIComponent(productName);
        }
        if (creatorEmail) {
            document.getElementById('creatorEmail').value = decodeURIComponent(creatorEmail);
        }
        if (formId) {
            document.getElementById('formId').value = formId;
        }
    }

    // Function to be called from Bubble.io
    window.showSappiForm = function() {
        document.getElementById('releaseForm').style.display = 'block';
    };

    // Function to hide the form
    window.hideSappiForm = function() {
        document.getElementById('releaseForm').style.display = 'none';
    };

    // Handle form submission
    document.getElementById('releaseForm').addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Get form data
        const formData = {
            formId: document.getElementById('formId').value,
            department: document.getElementById('department').value,
            companyName: document.getElementById('companyName').value,
            creatorEmail: document.getElementById('creatorEmail').value,
            productName: document.getElementById('productName').value,
            description: document.getElementById('description').value,
            chemicalChar: document.getElementById('chemicalChar').value,
            matNr: document.getElementById('matNr').value,
            productGroup: document.getElementById('productGroup').value,
            ratingClass: document.getElementById('ratingClass').value,
            submissionDate: new Date().toISOString()
        };

        // Send data to server
        fetch('/api/submit-form', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Send data to Bubble
                if (window.bubble) {
                    window.bubble.triggerEvent('sappiFormSubmitted', formData);
                }
                alert('Form submitted successfully!');
            } else {
                throw new Error('Form submission failed');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Error submitting form. Please try again.');
        });
    });

    // Initialize form when page loads
    populateFormFromUrl();
}

// Initialize when the document is ready
document.addEventListener('DOMContentLoaded', initializeBubbleForm);
