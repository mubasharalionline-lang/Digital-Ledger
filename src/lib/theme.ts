export type ThemeMode = 'light' | 'dark' | 'system';

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    return (localStorage.getItem('app_theme') as ThemeMode) || 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: ThemeMode) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('app_theme', theme);
  } catch {}
  
  let effectiveTheme: 'light' | 'dark' = 'light';
  if (theme === 'system') {
    effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } else {
    effectiveTheme = theme;
  }
  
  document.documentElement.setAttribute('data-theme', effectiveTheme);
  if (effectiveTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  
  window.dispatchEvent(new CustomEvent('app-theme-changed', { detail: { theme, effectiveTheme } }));
}

export function initTheme() {
  if (typeof window === 'undefined') return;
  const theme = getStoredTheme();
  applyTheme(theme);
}
