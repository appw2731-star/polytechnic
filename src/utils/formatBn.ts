const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBnDigits(value: number | string): string {
  return String(value).replace(/\d/g, (digit) => BN_DIGITS[Number(digit)] ?? digit);
}

export function formatTimerSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatDateBn(isoString: string): string {
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('bn-BD', {
      timeZone: 'Asia/Dhaka',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return isoString;
  }
}

export function formatTimeBn(isoString: string): string {
  try {
    return new Intl.DateTimeFormat('bn-BD', {
      timeZone: 'Asia/Dhaka',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(isoString));
  } catch {
    return '';
  }
}

export function formatTodayFullBn(): string {
  try {
    return new Intl.DateTimeFormat('bn-BD', {
      timeZone: 'Asia/Dhaka',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  } catch {
    return 'আজকের অধ্যয়ন পরিকল্পনা';
  }
}

export interface DhakaClockSnapshot {
  hours12: string;
  minutes: string;
  seconds: string;
  ampm: 'AM' | 'PM';
  periodBn: string;
  hhmm24: string;
  dateKey24: string;
  weekdayBn: string;
  dateBn: string;
}

export function getDhakaClockSnapshot(now: Date = new Date()): DhakaClockSnapshot {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const rawHour = Number(getPart('hour'));
  const hour24 = rawHour === 24 ? 0 : rawHour;
  const minute = getPart('minute');
  const second = getPart('second');

  const ampm: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
  const hour12Num = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const hours12 = String(hour12Num).padStart(2, '0');

  let periodBn = 'রাত';
  if (hour24 >= 5 && hour24 < 12) periodBn = 'সকাল';
  else if (hour24 >= 12 && hour24 < 15) periodBn = 'দুপুর';
  else if (hour24 >= 15 && hour24 < 18) periodBn = 'বিকাল';
  else if (hour24 >= 18 && hour24 < 20) periodBn = 'সন্ধ্যা';

  const weekdayBn = new Intl.DateTimeFormat('bn-BD', {
    timeZone: 'Asia/Dhaka',
    weekday: 'long',
  }).format(now);

  const dateBn = new Intl.DateTimeFormat('bn-BD', {
    timeZone: 'Asia/Dhaka',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);

  return {
    hours12,
    minutes: minute,
    seconds: second,
    ampm,
    periodBn,
    hhmm24: `${String(hour24).padStart(2, '0')}:${minute}`,
    dateKey24: `${year}-${month}-${day}`,
    weekdayBn,
    dateBn,
  };
}
