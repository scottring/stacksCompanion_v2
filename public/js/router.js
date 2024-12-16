// Router class to handle navigation
class Router {
    constructor() {
        this.routes = new Map();
        this.init();
    }

    init() {
        // Handle browser back/forward buttons
        window.addEventListener('popstate', () => {
            this.navigate(window.location.pathname);
        });
    }

    addRoute(path, handler) {
        this.routes.set(path, handler);
    }

    async navigate(path) {
        console.log('Navigating to:', path);
        const handler = this.routes.get(path) || this.routes.get('*');
        
        if (handler) {
            // Update URL without page reload
            window.history.pushState({}, '', path);
            await handler();
        }
    }
}

// Create router instance
const router = new Router();

// Add routes
router.addRoute('/', async () => {
    const user = firebase.auth().currentUser;
    if (user) {
        router.navigate('/dashboard');
        return;
    }
    window.location.href = '/index.html';
});

router.addRoute('/dashboard', async () => {
    const user = firebase.auth().currentUser;
    if (!user) {
        router.navigate('/');
        return;
    }
    window.location.href = '/dashboard.html';
});

router.addRoute('*', () => {
    console.log('404 - Route not found');
    router.navigate('/');
});

// Export router
window.router = router; 