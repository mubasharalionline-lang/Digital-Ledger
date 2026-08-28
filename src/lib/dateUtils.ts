/**
 * Unified Date Formatting Utilities
 * Standard: DD/MM/YYYY (e.g., 28/08/2026)
 * The order must always be Date → Month → Year across the entire system.
 */

/**
 * Formats any date input (YYYY-MM-DD, ISO string, timestamp, Date object) into DD/MM/YYYY.
 * Example: '2026-08-28' -> '28/08/2026'
 * Example: '2026-08-28T06:08:58.000Z' -> '28/08/2026'
 */
export function formatDate(dateInput?: string | Date | number | null): string {
  if (!dateInput && dateInput !== 0) return '—';

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '—';

    // Check if already in DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      return trimmed;
    }

    // Match DD-MM-YYYY or DD.MM.YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[-.](\d{1,2})[-.](\d{4})$/);
    if (dmyMatch) {
      return `${dmyMatch[1].padStart(2, '0')}/${dmyMatch[2].padStart(2, '0')}/${dmyMatch[3]}`;
    }

    // Match standard YYYY-MM-DD or YYYY/MM/DD
    const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (ymdMatch) {
      const year = ymdMatch[1];
      const month = ymdMatch[2].padStart(2, '0');
      const day = ymdMatch[3].padStart(2, '0');
      return `${day}/${month}/${year}`;
    }
  }

  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) {
      return typeof dateInput === 'string' ? dateInput : '—';
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '—';
  }
}

/**
 * Formats date and time into DD/MM/YYYY, HH:MM:SS AM/PM (or 12h format)
 * Example: 28/08/2026, 11:38:00 am
 */
export function formatDateTime(dateInput?: string | Date | number | null): string {
  if (!dateInput && dateInput !== 0) return '—';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) {
      return typeof dateInput === 'string' ? dateInput : '—';
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const timeStr = d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    return `${day}/${month}/${year}, ${timeStr}`;
  } catch {
    return '—';
  }
}

/**
 * Formats relative time (e.g. 'Just now', '5m ago', '2h ago', 'Yesterday', or 'DD/MM/YYYY')
 */
export function formatRelativeTime(dateInput?: string | Date | number | null): string {
  if (!dateInput && dateInput !== 0) return '';
  const now = Date.now();
  const d = new Date(dateInput);
  const time = d.getTime();
  if (isNaN(time)) return '';
  const diffSec = Math.floor((now - time) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
}
