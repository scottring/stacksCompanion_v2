import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Create a global event system
window.authEvents = {
    onAuthStateChanged: null,
    redirectTo: null
};

// Initialize Google Auth Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
    prompt: 'select_account'
});

// Google Sign In Handler
window.handleGoogleSignIn = async function() {
    console.log('Google Sign In clicked');
    try {
        console.log('Initializing Google Sign In...');
        await signInWithPopup(window.auth, googleProvider);
        console.log('Google Sign In successful');
        if (window.authEvents.redirectTo) {
            window.authEvents.redirectTo('/dashboard');
        }
    } catch (error) {
        console.error('Google Sign In Error:', error);
        alert('Google Sign In failed: ' + error.message);
    }
}

// Authentication state observer
onAuthStateChanged(window.auth, (user) => {
    console.log('Auth state changed:', user ? 'logged in' : 'logged out');
    if (user) {
        console.log('User email:', user.email);
        document.querySelectorAll('.auth-only').forEach(el => el.style.display = 'block');
        document.querySelectorAll('.no-auth').forEach(el => el.style.display = 'none');
    } else {
        console.log('No user authenticated');
        document.querySelectorAll('.auth-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.no-auth').forEach(el => el.style.display = 'block');
    }

    if (window.authEvents.onAuthStateChanged) {
        window.authEvents.onAuthStateChanged(user);
    }
});

// Handle logout
window.handleLogout = function() {
    signOut(window.auth)
        .then(() => {
            if (window.authEvents.redirectTo) {
                window.authEvents.redirectTo('/');
            }
        })
        .catch(error => console.error('Logout error:', error));
} 