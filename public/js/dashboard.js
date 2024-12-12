function initDashboard() {
    // State management
    let allForms = [];
    let filteredForms = [];

    // Format date
    function formatDate(timestamp) {
        if (!timestamp) return 'N/A';
        const date = timestamp instanceof Date ? timestamp : timestamp.toDate();
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    // Calculate progress
    function calculateProgress(form) {
        if (!form.reviewers) return 0;
        const totalReviewers = form.reviewers.length;
        const completedReviews = form.signatures ? Object.keys(form.signatures).length : 0;
        return (completedReviews / totalReviewers) * 100;
    }

    // Get status based on progress
    function getStatus(form) {
        // First check if status is directly set on the form
        if (form.status) {
            return form.status.toLowerCase();
        }
        
        // Fallback to calculating based on reviewers
        if (form.reviewers) {
            const progress = calculateProgress(form);
            if (progress === 0) return 'pending';
            if (progress === 100) return 'completed';
            return 'in-progress';
        }
        
        return 'pending';
    }

    // Render table row
    function renderTableRow(form) {
        // Calculate progress based on reviewers if they exist
        let progress = 0;
        if (form.reviewers) {
            const reviewerStatuses = Object.values(form.reviewers);
            const totalReviewers = reviewerStatuses.length;
            const completedReviews = reviewerStatuses.filter(status => status === 'approved').length;
            progress = (completedReviews / totalReviewers) * 100;
        }

        const status = getStatus(form);
        return `
            <tr>
                <td>${form.productName || 'Unnamed Product'}</td>
                <td>${form.department || 'N/A'}</td>
                <td><span class="status-badge status-${status.replace('_', '-')}">${status.replace('_', '-').toUpperCase()}</span></td>
                <td>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    ${progress.toFixed(0)}%
                </td>
                <td>${formatDate(form.createdAt) || 'N/A'}</td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="viewForm('${form.id}')">View</button>
                </td>
            </tr>
        `;
    }

    // View form
    window.viewForm = function(formId) {
        window.location.href = `https://internal-review.web.app/?id=${formId}`;
    }

    // Update table
    function updateTable() {
        const tableBody = document.getElementById('formsTableBody');
        if (filteredForms.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="loading">No forms found</td></tr>';
            return;
        }
        tableBody.innerHTML = filteredForms.map(renderTableRow).join('');
    }

    // Filter forms
    function filterForms() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const statusFilter = document.getElementById('statusFilter').value;
        const sortBy = document.getElementById('sortBy').value;

        filteredForms = allForms.filter(form => {
            const matchesSearch = (form.productName || '').toLowerCase().includes(searchTerm) ||
                               (form.department || '').toLowerCase().includes(searchTerm);
            const matchesStatus = statusFilter === 'all' || getStatus(form) === statusFilter;
            return matchesSearch && matchesStatus;
        });

        // Sort forms
        filteredForms.sort((a, b) => {
            switch (sortBy) {
                case 'newest':
                    return (b.createdAt || 0) - (a.createdAt || 0);
                case 'oldest':
                    return (a.createdAt || 0) - (b.createdAt || 0);
                case 'product':
                    return (a.productName || '').localeCompare(b.productName || '');
                default:
                    return 0;
            }
        });

        updateTable();
    }

    // Event listeners
    document.getElementById('searchInput').addEventListener('input', filterForms);
    document.getElementById('statusFilter').addEventListener('change', filterForms);
    document.getElementById('sortBy').addEventListener('change', filterForms);

    // Load forms from Firestore
    async function loadForms() {
        console.log('Loading forms...');
        const currentUser = firebase.auth().currentUser;
        console.log('Current user:', {
            email: currentUser?.email,
            emailVerified: currentUser?.emailVerified,
            uid: currentUser?.uid,
            claims: await currentUser?.getIdTokenResult()
        });

        const tableBody = document.getElementById('formsTableBody');
        tableBody.innerHTML = '<tr><td colspan="6" class="loading">Loading forms...</td></tr>';

        try {
            // Subscribe to the productReviews collection
            const formsCollectionRef = firebase.firestore().collection('productReviews');
            const subscription = formsCollectionRef
                .orderBy('createdAt', 'desc')
                .onSnapshot((snapshot) => {
                    console.log(`Product reviews:`, snapshot.size, 'Documents:', snapshot.docs.map(d => ({id: d.id, data: d.data()})));
                    
                    // Update allForms with the new data
                    const newForms = snapshot.docs.map(formDoc => ({
                        id: formDoc.id,
                        ...formDoc.data(),
                        createdAt: formDoc.data().createdAt?.toDate()
                    }));
                    
                    // Merge with existing forms, replacing any with same IDs
                    allForms = newForms;  // Just replace all forms since we're getting the full collection
                    console.log('Total forms after update:', allForms.length, 'Forms:', allForms);
                    filterForms();
                }, (error) => {
                    console.error('Error loading product reviews:', error);
                    console.error('Error details:', error.code, error.message);
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="6" class="text-center">
                                Error loading forms: ${error.message}
                            </td>
                        </tr>
                    `;
                });
                
            // Store subscriptions for cleanup
            window.formSubscriptions = [subscription];

        } catch (error) {
            console.error('Error in loadForms:', error);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center">
                        Error loading forms: ${error.message}
                    </td>
                </tr>
            `;
        }
    }

    // Add cleanup function
    window.addEventListener('beforeunload', () => {
        if (window.formSubscriptions) {
            window.formSubscriptions.forEach(subscription => subscription());
        }
    });

    // Initialize the dashboard
    loadForms();
} 