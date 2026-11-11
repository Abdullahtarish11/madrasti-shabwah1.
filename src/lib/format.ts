export function formatDate(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return value;
  }
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

export function formatTime(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('ar-YE', { timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

export function relativeTime(value?: string | null): string {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.round(hours / 24);
  if (days < 30) return `قبل ${days} يوم`;
  return formatDate(value);
}

export function fileSize(kb: number): string {
  if (!kb) return '—';
  if (kb < 1024) return `${kb} كيلوبايت`;
  return `${(kb / 1024).toFixed(1)} ميجابايت`;
}

export function roleLabel(role: string): string {
  return (
    {
      student: 'طالب',
      teacher: 'معلم',
      school_manager: 'مدير مدرسة',
      admin: 'مسؤول المنصة',
    }[role] ?? role
  );
}

export function statusLabel(status: string): string {
  return (
    {
      scheduled: 'مجدولة',
      live: 'مباشرة الآن',
      ended: 'منتهية',
      present: 'حاضر',
      absent: 'غائب',
      late: 'متأخر',
    }[status] ?? status
  );
}

export function statusTone(status: string): string {
  if (status === 'live') return 'bg-rose-100 text-rose-700';
  if (status === 'scheduled') return 'bg-brand-100 text-brand-700';
  if (status === 'ended') return 'bg-slate-100 text-slate-600';
  return 'bg-slate-100 text-slate-600';
}

export function toLocalInput(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function todayInput(): string {
  return toLocalInput(new Date(Date.now() + 3600000).toISOString());
}

export function scoreTone(percent: number): string {
  if (percent >= 80) return 'text-emerald-600';
  if (percent >= 50) return 'text-amber-600';
  return 'text-rose-600';
}
