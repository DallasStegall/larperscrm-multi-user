/**
 * LarpersCRM Supabase Client (v2 - improved error handling)
 *
 * Initializes the Supabase client and provides helper functions for:
 * - Authentication (signup, login, logout)
 * - Session management
 * - Per-agent data reads/writes
 */

// ============================================================================
// CONFIGURATION
// ============================================================================
// Your Supabase project credentials.
// Find them in your Supabase project: Settings > API.

const SUPABASE_URL = 'https://eristkfqgiaojcyqznom.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyaXN0a2ZxZ2lhb2pjeXF6bm9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMjgwNjcsImV4cCI6MjA5ODcwNDA2N30.4r9eh2SV7hjiughJBklHQycjL3zoYKyLChLWGYetq9Y';

// ============================================================================
// ERROR MESSAGE HELPER
// ============================================================================
// Supabase returns errors in several different shapes depending on the
// endpoint. This digs out the most useful human-readable message and, when
// possible, rewrites it into plain English for common cases.
function extractErrorMessage(data, fallback) {
  if (!data) return fallback;

  // Supabase auth can use any of these fields
  const raw =
    data.error_description ||
    data.msg ||
    data.message ||
    data.error ||
    data.error_code ||
    fallback;

  const lower = String(raw).toLowerCase();

  // Friendly rewrites for the errors agents will actually hit
  if (lower.includes('email not confirmed') || lower.includes('email_not_confirmed')) {
    return 'Your email needs to be confirmed before you can log in. ' +
           'Check your inbox for a confirmation link — or ask your admin to ' +
           'turn off email confirmation in Supabase.';
  }
  if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
    return 'Incorrect email or password. Please try again.';
  }
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return 'An account with this email already exists. Try logging in instead.';
  }
  if (lower.includes('password should be at least')) {
    return 'Password is too short. Please use at least 6 characters.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }

  return raw;
}

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

class SupabaseClient {
  constructor(url, key) {
    this.url = url;
    this.key = key;
    this.session = null;
    this.user = null;
  }

  /**
   * Initialize the client and restore session if available
   */
  async init() {
    const stored = localStorage.getItem('larperscrm_session');
    if (stored) {
      try {
        this.session = JSON.parse(stored);
        this.user = this.session.user;
        // Verify the session is still valid by fetching the user
        const user = await this.getUser();
        if (!user) {
          this.clearSession();
        }
      } catch (e) {
        this.clearSession();
      }
    }
    return this.session;
  }

  /**
   * Sign up a new agent
   */
  async signup(email, password, fullName) {
    try {
      const response = await fetch(`${this.url}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.key,
        },
        body: JSON.stringify({
          email,
          password,
          data: { full_name: fullName },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Signup error response:', data);
        throw new Error(extractErrorMessage(data, 'Signup failed'));
      }

      // If Supabase returns a session immediately (email confirmation OFF),
      // the user is logged in right away.
      if (data.access_token) {
        this.session = data;
        this.user = data.user;
        this.saveSession();
        return { success: true, user: this.user, needsConfirmation: false };
      }

      // If there's no session but signup succeeded, email confirmation is ON.
      // The user exists but must confirm their email before logging in.
      return {
        success: true,
        user: data.user || null,
        needsConfirmation: true,
      };
    } catch (error) {
      console.error('Signup exception:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Login an existing agent
   */
  async login(email, password) {
    try {
      const response = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.key,
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Login error response:', data);
        throw new Error(extractErrorMessage(data, 'Login failed'));
      }

      this.session = data;
      this.user = data.user;
      this.saveSession();

      return { success: true, user: this.user };
    } catch (error) {
      console.error('Login exception:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Logout the current user
   */
  logout() {
    this.clearSession();
    return { success: true };
  }

  /**
   * Get the current user
   */
  async getUser() {
    if (!this.session?.access_token) return null;

    try {
      const response = await fetch(`${this.url}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${this.session.access_token}`,
          apikey: this.key,
        },
      });

      if (response.ok) {
        const user = await response.json();
        this.user = user;
        return user;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get the current agent's profile
   */
  async getProfile() {
    if (!this.user?.id) return null;

    try {
      const response = await fetch(
        `${this.url}/rest/v1/profiles?id=eq.${this.user.id}`,
        {
          headers: {
            Authorization: `Bearer ${this.session.access_token}`,
            apikey: this.key,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data[0] || null;
      }

      return null;
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  }

  /**
   * Generic query helper for reading data
   * Only returns rows where agent_id = current user
   */
  async query(table, filters = {}) {
    if (!this.user?.id) return [];

    try {
      let url = `${this.url}/rest/v1/${table}?agent_id=eq.${this.user.id}`;

      // Add additional filters
      for (const [key, value] of Object.entries(filters)) {
        if (key !== 'agent_id') {
          url += `&${key}=eq.${encodeURIComponent(value)}`;
        }
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.session.access_token}`,
          apikey: this.key,
        },
      });

      if (response.ok) {
        return await response.json();
      }

      return [];
    } catch (error) {
      console.error(`Error querying ${table}:`, error);
      return [];
    }
  }

  /**
   * Insert a new row
   */
  async insert(table, data) {
    if (!this.user?.id) return { success: false, error: 'Not authenticated' };

    // Auto-add agent_id
    const payload = { ...data, agent_id: this.user.id };

    try {
      const response = await fetch(`${this.url}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.session.access_token}`,
          apikey: this.key,
          Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json();
        return { success: true, data: result[0] || result };
      }

      const error = await response.json();
      return { success: false, error: extractErrorMessage(error, 'Insert failed') };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update an existing row
   */
  async update(table, id, data) {
    if (!this.user?.id) return { success: false, error: 'Not authenticated' };

    try {
      const response = await fetch(
        `${this.url}/rest/v1/${table}?id=eq.${id}&agent_id=eq.${this.user.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.session.access_token}`,
            apikey: this.key,
            Prefer: 'return=representation',
          },
          body: JSON.stringify(data),
        }
      );

      if (response.ok) {
        const result = await response.json();
        return { success: true, data: result[0] || result };
      }

      const error = await response.json();
      return { success: false, error: extractErrorMessage(error, 'Update failed') };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a row
   */
  async delete(table, id) {
    if (!this.user?.id) return { success: false, error: 'Not authenticated' };

    try {
      const response = await fetch(
        `${this.url}/rest/v1/${table}?id=eq.${id}&agent_id=eq.${this.user.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${this.session.access_token}`,
            apikey: this.key,
          },
        }
      );

      if (response.ok) {
        return { success: true };
      }

      const error = await response.json();
      return { success: false, error: extractErrorMessage(error, 'Delete failed') };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Save session to localStorage
   */
  saveSession() {
    if (this.session) {
      localStorage.setItem('larperscrm_session', JSON.stringify(this.session));
    }
  }

  /**
   * Clear session from memory and storage
   */
  clearSession() {
    this.session = null;
    this.user = null;
    localStorage.removeItem('larperscrm_session');
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.session?.access_token;
  }
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

const db = new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await db.init();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { db, SupabaseClient };
}
