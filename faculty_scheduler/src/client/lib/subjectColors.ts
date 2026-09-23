export interface SubjectTheme {
  bg: string;
  bgLight: string;
  border: string;
  badge: string;
  accent: string;
  text: string;
  dot: string;
}

export const SUBJECT_THEMES: Record<string, SubjectTheme> = {
  biology: {
    bg: 'bg-emerald-50/70',
    bgLight: 'bg-emerald-50',
    border: 'border-emerald-200 hover:border-emerald-300',
    badge: 'bg-emerald-100/90 text-emerald-800 border-emerald-300',
    accent: 'bg-emerald-500',
    text: 'text-emerald-950',
    dot: 'bg-emerald-500'
  },
  mathematics: {
    bg: 'bg-blue-50/70',
    bgLight: 'bg-blue-50',
    border: 'border-blue-200 hover:border-blue-300',
    badge: 'bg-blue-100/90 text-blue-800 border-blue-300',
    accent: 'bg-blue-500',
    text: 'text-blue-950',
    dot: 'bg-blue-500'
  },
  physics: {
    bg: 'bg-violet-50/70',
    bgLight: 'bg-violet-50',
    border: 'border-violet-200 hover:border-violet-300',
    badge: 'bg-violet-100/90 text-violet-800 border-violet-300',
    accent: 'bg-violet-500',
    text: 'text-violet-950',
    dot: 'bg-violet-500'
  },
  chemistry: {
    bg: 'bg-amber-50/70',
    bgLight: 'bg-amber-50',
    border: 'border-amber-200 hover:border-amber-300',
    badge: 'bg-amber-100/90 text-amber-900 border-amber-300',
    accent: 'bg-amber-500',
    text: 'text-amber-950',
    dot: 'bg-amber-500'
  },
  'social science': {
    bg: 'bg-orange-50/70',
    bgLight: 'bg-orange-50',
    border: 'border-orange-200 hover:border-orange-300',
    badge: 'bg-orange-100/90 text-orange-900 border-orange-300',
    accent: 'bg-orange-500',
    text: 'text-orange-950',
    dot: 'bg-orange-500'
  },
  english: {
    bg: 'bg-sky-50/70',
    bgLight: 'bg-sky-50',
    border: 'border-sky-200 hover:border-sky-300',
    badge: 'bg-sky-100/90 text-sky-900 border-sky-300',
    accent: 'bg-sky-500',
    text: 'text-sky-950',
    dot: 'bg-sky-500'
  },
  hindi: {
    bg: 'bg-rose-50/70',
    bgLight: 'bg-rose-50',
    border: 'border-rose-200 hover:border-rose-300',
    badge: 'bg-rose-100/90 text-rose-900 border-rose-300',
    accent: 'bg-rose-500',
    text: 'text-rose-950',
    dot: 'bg-rose-500'
  },
  malayalam: {
    bg: 'bg-teal-50/70',
    bgLight: 'bg-teal-50',
    border: 'border-teal-200 hover:border-teal-300',
    badge: 'bg-teal-100/90 text-teal-900 border-teal-300',
    accent: 'bg-teal-500',
    text: 'text-teal-950',
    dot: 'bg-teal-500'
  },
  arabic: {
    bg: 'bg-indigo-50/70',
    bgLight: 'bg-indigo-50',
    border: 'border-indigo-200 hover:border-indigo-300',
    badge: 'bg-indigo-100/90 text-indigo-900 border-indigo-300',
    accent: 'bg-indigo-500',
    text: 'text-indigo-950',
    dot: 'bg-indigo-500'
  }
};

const DEFAULT_THEMES: SubjectTheme[] = [
  {
    bg: 'bg-purple-50/70',
    bgLight: 'bg-purple-50',
    border: 'border-purple-200 hover:border-purple-300',
    badge: 'bg-purple-100 text-purple-900 border-purple-300',
    accent: 'bg-purple-500',
    text: 'text-purple-950',
    dot: 'bg-purple-500'
  },
  {
    bg: 'bg-cyan-50/70',
    bgLight: 'bg-cyan-50',
    border: 'border-cyan-200 hover:border-cyan-300',
    badge: 'bg-cyan-100 text-cyan-900 border-cyan-300',
    accent: 'bg-cyan-500',
    text: 'text-cyan-950',
    dot: 'bg-cyan-500'
  },
  {
    bg: 'bg-lime-50/70',
    bgLight: 'bg-lime-50',
    border: 'border-lime-200 hover:border-lime-300',
    badge: 'bg-lime-100 text-lime-900 border-lime-300',
    accent: 'bg-lime-500',
    text: 'text-lime-950',
    dot: 'bg-lime-500'
  }
];

export function getSubjectTheme(subjectName?: string | null): SubjectTheme {
  if (!subjectName) {
    return {
      bg: 'bg-slate-50',
      bgLight: 'bg-slate-50',
      border: 'border-slate-200 hover:border-slate-300',
      badge: 'bg-slate-100 text-slate-800 border-slate-200',
      accent: 'bg-slate-400',
      text: 'text-slate-900',
      dot: 'bg-slate-400'
    };
  }

  const key = subjectName.trim().toLowerCase();
  if (SUBJECT_THEMES[key]) {
    return SUBJECT_THEMES[key];
  }

  // Consistent fallback based on hash
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
  }
  const index = Math.abs(hash) % DEFAULT_THEMES.length;
  return DEFAULT_THEMES[index];
}
