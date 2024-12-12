class Router {
    constructor(routes) {
        this.routes = routes;
        this.currentPath = '';
        
        window.addEventListener('popstate', () => this.handleRoute());
        this.handleRoute();

        // Set up auth state change handler
        window.authEvents.onAuthStateChanged = (user) => {
            if (!user && window.location.pathname.startsWith('/dashboard')) {
                console.log('Redirecting from dashboard to home');
                this.navigate('/');
            }
        };
    }

    handleRoute() {
        const path = window.location.pathname;
        if (path === this.currentPath) return;
        
        this.currentPath = path;
        const route = this.routes[path] || this.routes['*'];
        route();
    }

    navigate(path) {
        window.history.pushState(null, '', path);
        this.handleRoute();
    }
}

// Initialize router with routes
const router = new Router({
    '/': () => {
        // Show login form if not authenticated
        const loginHtml = `
            <div class="row justify-content-center">
                <div class="col-md-6 col-lg-4">
                    <div class="card">
                        <div class="card-body">
                            <h2 class="text-center mb-4">Login</h2>
                            <form id="loginForm">
                                <div class="mb-3">
                                    <label class="form-label">Email</label>
                                    <input type="email" class="form-control" id="email" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Password</label>
                                    <input type="password" class="form-control" id="password" required>
                                </div>
                                <button type="submit" class="btn btn-primary w-100 mb-3">Login</button>
                            </form>
                            <div class="text-center">
                                <hr class="my-4">
                                <p class="text-muted mb-3">Or sign in with</p>
                                <button onclick="handleGoogleSignIn()" class="btn btn-danger btn-lg w-100">
                                    <img src="https://www.google.com/favicon.ico" alt="Google" width="20" class="me-2">
                                    Sign in with Google
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('main-content').innerHTML = loginHtml;
        
        // Add login form handler
        document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                await firebase.auth().signInWithEmailAndPassword(email, password);
                router.navigate('/dashboard');
            } catch (error) {
                alert('Login failed: ' + error.message);
            }
        });
    },
    '/dashboard': async () => {
        // Check authentication
        const user = firebase.auth().currentUser;
        if (!user) {
            router.navigate('/');
            return;
        }
        
        try {
            // Load dashboard content
            const response = await fetch('/views/dashboard.html');
            if (!response.ok) throw new Error('Failed to load dashboard content');
            const content = await response.text();
            document.getElementById('main-content').innerHTML = content;
            
            // Initialize dashboard functionality
            initDashboard();
        } catch (error) {
            console.error('Error loading dashboard:', error);
            document.getElementById('main-content').innerHTML = `
                <div class="alert alert-danger">
                    Error loading dashboard: ${error.message}
                </div>
            `;
        }
    },
    '*': () => {
        document.getElementById('main-content').innerHTML = '<h1>404 - Page Not Found</h1>';
    }
});

window.router = router;
window.authEvents.redirectTo = (path) => router.navigate(path); 