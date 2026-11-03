// Shared by the server pages and the browser editor: no server imports here.

export type InviteLayout = 'classic' | 'arch' | 'floral' | 'mandala' | 'modern' | 'royal';
export type InviteTheme = { bg: string; ink: string; accent: string; font: 'serif' | 'sans' | string };
export type InviteDesign = { code: string; name: string; layout: InviteLayout; theme: InviteTheme; kind: 'card' | 'save_the_date'; culture: string; themes: string[] };
export type InviteEvent = { name: string; when: string; venue: string };
export type InviteContent = {
  kind: 'card' | 'save_the_date';
  opening: string;
  bride: string;
  groom: string;
  family: string;
  dateLine: string;
  message: string;
  events: InviteEvent[];
  photo?: string | null;
};

export const CULTURES: Record<string, { label: string; opening: string }> = {
  generic: { label: 'Any culture', opening: 'Together with their families' },
  hindu: { label: 'Hindu', opening: '॥ श्री गणेशाय नमः ॥' },
  sikh: { label: 'Sikh', opening: 'ੴ ਸਤਿ ਨਾਮੁ' },
  punjabi: { label: 'Punjabi', opening: 'With the blessings of Waheguru and our elders' },
  muslim: { label: 'Muslim', opening: 'بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ' },
  christian: { label: 'Christian', opening: '“Two are better than one.” Ecclesiastes 4:9' },
  'south-indian': { label: 'South Indian', opening: 'Sri Ganeshaya Namaha' },
  marathi: { label: 'Marathi', opening: '॥ श्री गणेशाय नमः ॥' },
  bengali: { label: 'Bengali', opening: 'শুভ বিবাহ' },
};

export const THEMES: Record<string, string> = {
  traditional: 'Traditional',
  royal: 'Royal',
  floral: 'Floral',
  elegant: 'Elegant',
  minimal: 'Minimal',
  modern: 'Modern',
  luxury: 'Luxury',
  'save-the-date': 'Save the date',
};

export const SAMPLE: InviteContent = {
  kind: 'card',
  opening: 'Together with their families',
  bride: 'Simran',
  groom: 'Arjun',
  family: 'Daughter of Mrs and Mr Kaur · Son of Mrs and Mr Mehta',
  dateLine: 'Sunday, 14 February 2027',
  message: 'request the pleasure of your company as they begin their life together.',
  events: [
    { name: 'Mehendi', when: 'Fri, 12 Feb · 4 pm', venue: 'Family home, Sector 9' },
    { name: 'Sangeet', when: 'Sat, 13 Feb · 7 pm', venue: 'Rosewood Banquets' },
    { name: 'Wedding', when: 'Sun, 14 Feb · 11 am', venue: 'Sukhna Greens Lawn' },
  ],
};

export const fontFor = (t: InviteTheme) => (t.font === 'sans' ? 'var(--font-sans)' : 'var(--font-serif)');
export const SCRIPT = 'var(--font-script)';
