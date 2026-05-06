import { supabase, User } from './supabase';

export async function loginUser(username: string, password: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .eq('password', password)
    .single();

  if (error || !data) return null;
  return data as User;
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
