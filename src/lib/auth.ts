import { supabase, User } from './supabase';

// ─── Cookie helpers (persistent across browser restarts) ───────────
const COOKIE_USER_KEY = 'dl_user';
const COOKIE_COUNTRY_KEY = 'dl_country';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

function setCookie(name: string, value: string, maxAge: number = COOKIE_MAX_AGE) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${maxAge};SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=;path=/;max-age=0;SameSite=Lax`;
}

// ─── Auth functions ────────────────────────────────────────────────

export async function loginUser(username: string, password: string, country?: string): Promise<User | null> {
  const cleanUsername = username.trim();
  let query = supabase
    .from('users')
    .select('id, username, role, country, permissions, created_at')
    .ilike('username', cleanUsername)
    .eq('password', password);

  // If country is specified, scope login to that country
  if (country) {
    query = query.eq('country', country);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) return null;
  
  // Filter exact matches case-insensitively to prevent wildcard exploits (e.g., matching '%')
  const exactMatches = data.filter(u => u.username.toLowerCase() === cleanUsername.toLowerCase());

  // If exactly one match, return it
  if (exactMatches.length === 1) return exactMatches[0] as User;
  
  // Multiple matches (same username+password, different countries)
  // Return null to signal disambiguation is needed
  return null;
}

export async function getLoginCountries(username: string, password: string): Promise<string[]> {
  const cleanUsername = username.trim();
  const { data } = await supabase
    .from('users')
    .select('country, username')
    .ilike('username', cleanUsername)
    .eq('password', password);

  if (!data) return [];
  const exactMatches = data.filter(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
  return exactMatches.map(u => u.country).filter(Boolean) as string[];
}

/**
 * Persist session in both localStorage (fast reads) and cookies (survives browser restart).
 * Cookies are set with a 30-day expiry for "remember me" behavior.
 */
export function setSession(user: User, country: string) {
  if (typeof window !== 'undefined') {
    const userJson = JSON.stringify(user);
    // localStorage — fast, same-origin
    localStorage.setItem('dl_user', userJson);
    localStorage.setItem('dl_country', country);
    // Cookies — survive browser restart
    setCookie(COOKIE_USER_KEY, userJson);
    setCookie(COOKIE_COUNTRY_KEY, country);
  }
}

/**
 * Read session from localStorage first (fast). If missing, try cookies (persistent).
 * If recovered from cookies, re-populate localStorage for future fast reads.
 */
export function getSession(): { user: User | null; country: string | null } {
  if (typeof window === 'undefined') return { user: null, country: null };

  let userStr = localStorage.getItem('dl_user');
  let country = localStorage.getItem('dl_country');

  // Fallback to cookies if localStorage is empty (e.g. after browser restart cleared storage)
  if (!userStr) {
    const cookieUser = getCookie(COOKIE_USER_KEY);
    const cookieCountry = getCookie(COOKIE_COUNTRY_KEY);
    if (cookieUser) {
      userStr = cookieUser;
      country = cookieCountry;
      // Re-populate localStorage from cookies
      localStorage.setItem('dl_user', cookieUser);
      if (cookieCountry) localStorage.setItem('dl_country', cookieCountry);
    }
  }

  return {
    user: userStr ? JSON.parse(userStr) : null,
    country: country || null,
  };
}

/**
 * Clear session from both localStorage and cookies (explicit logout).
 */
export function clearSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('dl_user');
    localStorage.removeItem('dl_country');
    deleteCookie(COOKIE_USER_KEY);
    deleteCookie(COOKIE_COUNTRY_KEY);
    // Also clear any cached dashboard/task data
    sessionStorage.clear();
  }
}

export function isAdmin(user: User | null): boolean {
  const role = user?.role?.toLowerCase();
  const username = user?.username?.toLowerCase();
  return role === 'admin' || role === 'superadmin' || username === 'admin';
}

export function isSuperAdmin(user: User | null): boolean {
  // Define super admin logic. 'admin' username is the default master account.
  const role = user?.role?.toLowerCase();
  const username = user?.username?.toLowerCase();
  return username === 'admin' || role === 'superadmin';
}

/**
 * Returns the country whose data should be loaded.
 * - Non-admin users always see their own country's data.
 * - Admins see the country they've selected in the session (defaults to Bahrain).
 */
export function getDataCountry(): string | null {
  const { user, country } = getSession();
  if (!user) return null;
  
  // Super Admins (Master accounts) can see the session-selected country
  if (isSuperAdmin(user) && country && country !== 'undefined' && country !== 'null') {
    return country;
  }
  
  // EVERYONE else (including regular Admins) is locked to their own country
  if (user.country && user.country !== 'undefined' && user.country !== 'null') {
    return user.country;
  }
  
  return 'Bahrain'; // Default fallback
}
