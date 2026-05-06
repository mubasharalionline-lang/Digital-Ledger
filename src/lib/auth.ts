import { supabase, User } from './supabase';

export async function loginUser(username: string, password: string, country?: string): Promise<User | null> {
  let query = supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .eq('password', password);

  // If country is specified, scope login to that country
  if (country) {
    query = query.eq('country', country);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) return null;
  
  // If exactly one match, return it
  if (data.length === 1) return data[0] as User;
  
  // Multiple matches (same username+password, different countries)
  // Return null to signal disambiguation is needed
  return null;
}

// Get all countries a username+password combo exists in (for disambiguation)
export async function getLoginCountries(username: string, password: string): Promise<string[]> {
  const { data } = await supabase
    .from('users')
    .select('country')
    .eq('username', username)
    .eq('password', password);

  if (!data) return [];
  return data.map(u => u.country).filter(Boolean) as string[];
}

export function setSession(user: User, country: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('dl_user', JSON.stringify(user));
    localStorage.setItem('dl_country', country);
  }
}

export function getSession(): { user: User | null; country: string | null } {
  if (typeof window === 'undefined') return { user: null, country: null };
  const userStr = localStorage.getItem('dl_user');
  const country = localStorage.getItem('dl_country');
  return {
    user: userStr ? JSON.parse(userStr) : null,
    country,
  };
}

export function clearSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('dl_user');
    localStorage.removeItem('dl_country');
  }
}

export function isAdmin(user: User | null): boolean {
  return user?.role === 'admin';
}

export function getDataCountry(): string | null {
  const { user, country } = getSession();
  if (!user) return null;
  
  // Staff always use their saved country
  if (user.role === 'staff' && user.country && user.country !== 'undefined' && user.country !== 'null') {
    return user.country;
  }
  
  // Admin uses session-selected country
  if (country && country !== 'undefined' && country !== 'null') {
    return country;
  }
  
  return 'Bahrain'; // Default fallback
}
