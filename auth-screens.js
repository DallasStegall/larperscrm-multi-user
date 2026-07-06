/**
 * LarpersCRM Authentication Screens
 * Handles login and signup UI and logic
 */

class AuthUI {
  constructor() {
    this.currentScreen = 'login'; // 'login' or 'signup'
  }

  /**
   * Show the authentication page
   */
  render() {
    const authContainer = document.getElementById('auth-container');
    
    if (!authContainer) {
      // Create if it doesn't exist
      const container = document.createElement('div');
      container.id = 'auth-container';
      document.body.insertBefore(container, document.body.firstChild);
    }

    const html = `
      <style>
        #auth-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #0c0e14 0%, #1a1f2e 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          font-family: 'Inter', sans-serif;
        }

        .auth-card {
          background: #111318;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 40px;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        }

        .auth-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .auth-logo {
          font-size: 28px;
          font-weight: 700;
          color: #e8eaf0;
          margin-bottom: 8px;
        }

        .auth-tagline {
          color: #8b8fa8;
          font-size: 14px;
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .auth-input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .auth-input-group label {
          font-size: 13px;
          font-weight: 500;
          color: #e8eaf0;
        }

        .auth-input-group input {
          padding: 10px 12px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          background: #0c0e14;
          color: #e8eaf0;
          font-size: 14px;
          transition: border-color 0.15s;
        }

        .auth-input-group input:focus {
          outline: none;
          border-color: hsl(217, 91%, 60%);
          box-shadow: 0 0 0 3px hsl(217, 91%, 60% / 0.15);
        }

        .auth-input-group input::placeholder {
          color: #5a5e72;
        }

        .auth-button {
          padding: 11px 16px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }

        .auth-button-primary {
          background: hsl(217, 91%, 60%);
          color: #fff;
        }

        .auth-button-primary:hover {
          background: hsl(217, 91%, 55%);
        }

        .auth-button-primary:active {
          transform: scale(0.98);
        }

        .auth-button-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .auth-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 20px 0;
          color: #8b8fa8;
          font-size: 13px;
        }

        .auth-divider::before,
        .auth-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(255, 255, 255, 0.08);
        }

        .auth-toggle {
          text-align: center;
          margin-top: 16px;
          font-size: 13px;
          color: #8b8fa8;
        }

        .auth-toggle button {
          background: none;
          border: none;
          color: hsl(217, 91%, 60%);
          cursor: pointer;
          font-weight: 600;
          padding: 0;
          margin-left: 4px;
        }

        .auth-toggle button:hover {
          text-decoration: underline;
        }

        .auth-error {
          padding: 10px 12px;
          border-radius: 8px;
          background: hsl(0, 84%, 60% / 0.1);
          border: 1px solid hsl(0, 84%, 60% / 0.3);
          color: hsl(0, 84%, 70%);
          font-size: 13px;
          display: none;
        }

        .auth-error.show {
          display: block;
        }

        .auth-success {
          padding: 10px 12px;
          border-radius: 8px;
          background: hsl(142, 71%, 45% / 0.1);
          border: 1px solid hsl(142, 71%, 45% / 0.3);
          color: hsl(142, 71%, 55%);
          font-size: 13px;
          display: none;
        }

        .auth-success.show {
          display: block;
        }
      </style>

      <div class="auth-card">
        <div class="auth-header">
          <div class="auth-logo">LarpersCRM</div>
          <div class="auth-tagline">Insurance Agent Platform</div>
        </div>

        <div id="auth-error" class="auth-error"></div>
        <div id="auth-success" class="auth-success"></div>

        <form class="auth-form" id="auth-form">
          ${this.currentScreen === 'login' ? this.renderLoginForm() : this.renderSignupForm()}
        </form>

        <div class="auth-toggle">
          ${
            this.currentScreen === 'login'
              ? "Don't have an account? <button type='button' onclick='authUI.switchToSignup()'>Sign up</button>"
              : "Already have an account? <button type='button' onclick='authUI.switchToLogin()'>Log in</button>"
          }
        </div>
      </div>
    `;

    document.getElementById('auth-container').innerHTML = html;
    this.attachEventListeners();
  }

  /**
   * Login form HTML
   */
  renderLoginForm() {
    return `
      <div class="auth-input-group">
        <label for="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          placeholder="you@example.com"
          required
        />
      </div>
      <div class="auth-input-group">
        <label for="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          placeholder="••••••••"
          required
        />
      </div>
      <button type="submit" class="auth-button auth-button-primary">
        Log in
      </button>
    `;
  }

  /**
   * Signup form HTML
   */
  renderSignupForm() {
    return `
      <div class="auth-input-group">
        <label for="signup-name">Full Name</label>
        <input
          id="signup-name"
          type="text"
          placeholder="John Doe"
          required
        />
      </div>
      <div class="auth-input-group">
        <label for="signup-email">Email</label>
        <input
          id="signup-email"
          type="email"
          placeholder="you@example.com"
          required
        />
      </div>
      <div class="auth-input-group">
        <label for="signup-password">Password</label>
        <input
          id="signup-password"
          type="password"
          placeholder="••••••••"
          required
        />
      </div>
      <div class="auth-input-group">
        <label for="signup-password-confirm">Confirm Password</label>
        <input
          id="signup-password-confirm"
          type="password"
          placeholder="••••••••"
          required
        />
      </div>
      <button type="submit" class="auth-button auth-button-primary">
        Sign up
      </button>
    `;
  }

  /**
   * Attach event listeners to forms
   */
  attachEventListeners() {
    const form = document.getElementById('auth-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (this.currentScreen === 'login') {
        await this.handleLogin();
      } else {
        await this.handleSignup();
      }
    });
  }

  /**
   * Handle login submission
   */
  async handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('auth-error');
    const button = document.querySelector('.auth-button-primary');

    if (!email || !password) {
      this.showError('Please fill in all fields', errorDiv);
      return;
    }

    // Clear any previous error before trying
    errorDiv.classList.remove('show');

    button.disabled = true;
    button.textContent = 'Logging in...';

    const result = await db.login(email, password);

    if (result.success) {
      this.showSuccess('Login successful! Redirecting...', document.getElementById('auth-success'));
      setTimeout(() => {
        this.hide();
        window.location.reload(); // Reload to initialize the app with auth context
      }, 1000);
    } else {
      this.showError(result.error, errorDiv);
      button.disabled = false;
      button.textContent = 'Log in';
    }
  }

  /**
   * Handle signup submission
   */
  async handleSignup() {
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-password-confirm').value;
    const errorDiv = document.getElementById('auth-error');
    const button = document.querySelector('.auth-button-primary');

    if (!name || !email || !password || !confirm) {
      this.showError('Please fill in all fields', errorDiv);
      return;
    }

    if (password !== confirm) {
      this.showError('Passwords do not match', errorDiv);
      return;
    }

    if (password.length < 6) {
      this.showError('Password must be at least 6 characters', errorDiv);
      return;
    }

    // Clear any previous error before trying
    errorDiv.classList.remove('show');

    button.disabled = true;
    button.textContent = 'Creating account...';

    const result = await db.signup(email, password, name);

    if (result.success && result.needsConfirmation) {
      // Email confirmation is ON — the account exists but can't log in yet.
      this.showSuccess(
        'Account created! Please check your email for a confirmation link, ' +
        'then come back and log in.',
        document.getElementById('auth-success')
      );
      button.disabled = false;
      button.textContent = 'Sign up';
    } else if (result.success) {
      // Auto-logged in (email confirmation OFF)
      this.showSuccess('Account created! Loading your dashboard...', document.getElementById('auth-success'));
      setTimeout(() => {
        this.hide();
        window.location.reload();
      }, 1000);
    } else {
      this.showError(result.error, errorDiv);
      button.disabled = false;
      button.textContent = 'Sign up';
    }
  }

  /**
   * Switch to login screen
   */
  switchToLogin() {
    this.currentScreen = 'login';
    this.render();
  }

  /**
   * Switch to signup screen
   */
  switchToSignup() {
    this.currentScreen = 'signup';
    this.render();
  }

  /**
   * Show error message
   */
  showError(message, element) {
    element.textContent = message;
    element.classList.add('show');
  }

  /**
   * Show success message
   */
  showSuccess(message, element) {
    element.textContent = message;
    element.classList.add('show');
  }

  /**
   * Hide the auth UI
   */
  hide() {
    const container = document.getElementById('auth-container');
    if (container) {
      container.style.display = 'none';
    }
  }

  /**
   * Show the auth UI
   */
  show() {
    const container = document.getElementById('auth-container');
    if (container) {
      container.style.display = 'flex';
    }
  }
}

// Global instance
const authUI = new AuthUI();

// Initialize auth on page load
document.addEventListener('DOMContentLoaded', async () => {
  const session = await db.init();
  if (!session) {
    authUI.render();
  } else {
    authUI.hide();
  }
});
