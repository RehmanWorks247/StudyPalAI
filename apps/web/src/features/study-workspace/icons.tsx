type IconProps = {
  name: string;
  size?: number;
  className?: string;
};

const paths: Record<string, string> = {
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  search: 'M21 21l-4.6-4.6M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2ZM3 9h18',
  calendar:
    'M8 2v4m8-4v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm2 9h2m6 0h2m-10 4h2m6 0h2',
  layers: 'm12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  book: 'M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15',
  help: 'M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0ZM9 8.5a3 3 0 0 1 6 .5c0 2-3 2-3 4m0 3v.1',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16',
  chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H5l-3 2V11.5a9.5 9.5 0 0 1 19 0ZM7 10h10M7 14h6',
  tutor: 'm2 9 10-5 10 5-10 5Zm4 3v5c4 3 8 3 12 0v-5m4-3v8M8 21h8',
  mic: 'M8 6a4 4 0 0 1 8 0v6a4 4 0 0 1-8 0Zm-3 6a7 7 0 0 0 14 0m-7 7v3m-4 0h8',
  quiz: 'M9 3H5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4M9 2h6v4H9Zm0 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v.1',
  upload: 'M12 16V3m-5 5 5-5 5 5M3 15v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-right': 'm9 6 6 6-6 6',
  panel: 'M3 4h18v16H3Zm5 0v16m5-11 3 3-3 3',
  close: 'm6 6 12 12M6 18 18 6',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 11.9v.2m7-.2v.2m7-.2v.2',
  settings:
    'm9 3-1 3-3 1-2 3 2 2v3l2 3 3-1 2 2h3l1-3 3-1 2-3-2-2V7l-2-3-3 1-2-2Zm7 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  copy: 'M8 8h13v13H8ZM16 8V3H3v13h5',
  share:
    'M15 5a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM3 12a3 3 0 1 1 6 0 3 3 0 0 1-6 0Zm12 7a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM9 11l6-5m-6 7 6 5',
  timer: 'M9 2h6m-3 0v3m6 2 2-2M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5v5l3 2',
  inbox: 'M6 3h12l4 11v7H2v-7Zm-4 11h6l2 3h4l2-3h6',
  bolt: 'm13 2-9 12h7l-1 8L20 9h-7Z',
  check: 'm5 12 4 4L19 6',
  trophy:
    'M7 3h10v6a5 5 0 0 1-10 0Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 2v5m-4 2h8m-7-2h6v2H9Z',
  'arrow-up': 'M12 20V4m-7 7 7-7 7 7',
  'arrow-right': 'M4 12h16m-7-7 7 7-7 7',
  play: 'm8 4 13 8-13 8Z',
  pause: 'M7 4h3v16H7Zm7 0h3v16h-3Z',
  stop: 'M5 5h14v14H5Z',
  headphones: 'M3 14v-3a9 9 0 0 1 18 0v3M3 13h4v8H3Zm14 0h4v8h-4Z',
  flashcards: 'm3 8 14-5 5 15-14 5ZM3 15l-2-9 14-4m-7 9 8-3m-7 7 5-2',
  gamepad:
    'M7 7h10c3 0 4 4 5 10 .5 3-2 4-4 2l-3-3H9l-3 3c-2 2-4.5 1-4-2 1-6 2-10 5-10Zm-2 5h6m-3-3v6m8-3v.1m3 2v.1',
  app: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
  link: 'm10 13 4-4m-5 7-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0-2 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  file: 'M5 2h9l5 5v15H5Zm9 0v6h5M8 13h8m-8 4h6',
  video: 'M3 5h12v14H3Zm12 5 7-4v12l-7-4',
  volume: 'M3 9h4l5-5v16l-5-5H3Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  globe: 'M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0ZM2 12h20M12 2c-5 5-5 15 0 20 5-5 5-15 0-20Z',
  'check-circle': 'M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0Zm-15 0 3 3 7-7',
  sparkles:
    'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM3 2v4M1 4h4m15 13v5m-2.5-2.5h5',
  phone: 'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm3 3h4m-2 14v.1',
  pencil: 'm16 3 5 5L8 21l-6 1 1-6Zm-2 2 5 5M3 16l5 5',
  skip: 'm4 5 11 7-11 7Zm14 0v14',
  download: 'M12 3v13m-5-5 5 5 5-5M3 16v5h18v-5',
  filter: 'M3 5h18M6 12h12m-9 7h6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15m-9 4v7m4-7v7',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Zm14 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  moon: 'M20 15a9 9 0 0 1-11-11 9 9 0 1 0 11 11Z',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-4-11v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2',
  monitor: 'M2 3h20v14H2Zm6 19h8m-4-5v5',
  users:
    'M15 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM5 21v-4a7 7 0 0 1 14 0v4M19 3a3 3 0 0 1 0 6m1 4a4 4 0 0 1 3 4v4M5 3a3 3 0 0 0 0 6m-1 4a4 4 0 0 0-3 4v4',
};

export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 3.5 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name] ?? paths.book} />
    </svg>
  );
}
