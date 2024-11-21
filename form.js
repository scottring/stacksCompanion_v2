document.addEventListener('DOMContentLoaded', function() {
    // Form element
    const form = document.getElementById('productReleaseForm');

    // Populate dropdown options
    const dropdowns = {
        'requesting_department': [
            'Production',
            'Quality Control',
            'Research & Development',
            'Technical Support',
            'Engineering'
        ],
        'department': [
            'Paper Production',
            'Coating',
            'Converting',
            'Laboratory',
            'Maintenance'
        ],
        'product_group': [
            'Raw Materials',
            'Chemical Additives',
            'Coating Materials',
            'Process Aids',
            'Packaging Materials'
        ],
        'rating_class': [
            'Class A - Critical',
            'Class B - Major',
            'Class C - Minor'
        ]
    };

    // Debug: Log all select elements found
    const allSelects = form.querySelectorAll('select');
    console.log(`Found ${allSelects.length} select elements`);
    allSelects.forEach(select => {
        console.log(`Select element name: ${select.name}`);
    });

    // Populate all select elements
    Object.entries(dropdowns).forEach(([selectName, options]) => {
        const select = form.querySelector(`select[name="${selectName}"]`);
        console.log(`Looking for select with name: ${selectName}`);
        
        if (select) {
            console.log(`Found select element for ${selectName}, current options: ${select.options.length}`);
            
            // Clear existing options except the first one (placeholder)
            while (select.options.length > 1) {
                select.remove(1);
            }
            
            // Add new options
            options.forEach(optionText => {
                const option = document.createElement('option');
                option.value = optionText;
                option.textContent = optionText;
                select.appendChild(option);
                console.log(`Added option: ${optionText} to ${selectName}`);
            });
            
            // Debug: Log final state
            console.log(`${selectName} now has ${select.options.length} options`);
            
            // Add change event listener
            select.addEventListener('change', function(e) {
                console.log(`${selectName} value changed to: ${e.target.value}`);
            });
        } else {
            console.warn(`Select element not found for ${selectName}`);
        }
    });

    // Add form validation
    function validateForm() {
        const requiredFields = form.querySelectorAll('[required]');
        let isValid = true;
        
        requiredFields.forEach(field => {
            if (!field.value) {
                field.classList.add('is-invalid');
                console.log(`Validation failed for: ${field.name}`);
                isValid = false;
            } else {
                field.classList.remove('is-invalid');
            }
        });
        
        return isValid;
    }

    // Handle form submission
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        console.log('Form submission started');
        
        if (!validateForm()) {
            console.log('Form validation failed');
            alert('Please fill in all required fields');
            return;
        }

        // Collect form data
        const formData = new FormData(form);
        const formObject = {};
        formData.forEach((value, key) => {
            formObject[key] = value;
            console.log(`Form data: ${key} = ${value}`);
        });

        try {
            console.log('Sending form data to server');
            const response = await fetch('/api/submit-form', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formObject)
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const result = await response.json();
            
            if (result.success) {
                console.log('Form submitted successfully');
                alert('Form submitted successfully!');
                form.reset();
            } else {
                throw new Error('Form submission failed');
            }
        } catch (error) {
            console.error('Error submitting form:', error);
            alert('There was an error submitting the form. Please try again.');
        }
    });

    console.log('Form initialization completed');
});
