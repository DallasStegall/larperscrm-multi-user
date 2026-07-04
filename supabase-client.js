/**
 * LarpersCRM Supabase Client
 * 
 * Initializes the Supabase client and provides helper functions for:
 * - Authentication (signup, login, logout)
 * - Session management
 * - Per-agent data reads/writes
 */

// ============================================================================
// CONFIGURATION
// ============================================================================
// IMPORTANT: Replace these with your Supabase project credentials.
// You can find them in your Supabase project settings > API.
// 
// Do NOT commit these to version control. Use environment variables in production.

const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

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
        throw new Error(data.message || 'Signup failed');
      }

      // Sign up successful, user is auto-logged in
      this.session = data.session;
      this.user = data.user;
      this.saveSession();

      return { success: true, user: this.user };
    } catch (error) {
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
        throw new Error(data.error_description || 'Login failed');
      }

      this.session = data;
      this.user = data.user;
      this.saveSession();

      return { success: true, user: this.user };
    } catch (error) {
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
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json();
        return { success: true, data: result[0] || result };
      }

      const error = await response.json();
      return { success: false, error: error.message || 'Insert failed' };
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
          },
          body: JSON.stringify(data),
        }
      );

      if (response.ok) {
        const result = await response.json();
        return { success: true, data: result[0] || result };
      }

      const error = await response.json();
      return { success: false, error: error.message || 'Update failed' };
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
      return { success: false, error: error.message || 'Delete failed' };
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
