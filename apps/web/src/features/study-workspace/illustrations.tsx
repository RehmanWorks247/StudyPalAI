import type { ReactNode } from 'react';

type IllustrationKind =
  | 'chat'
  | 'read'
  | 'quiz'
  | 'flashcards'
  | 'audio'
  | 'upload'
  | 'tutor'
  | 'record'
  | 'arcade'
  | 'apps'
  | 'set';

type ToolIllustrationProps = {
  kind: IllustrationKind;
  className?: string;
};

const artwork: Record<Exclude<IllustrationKind, 'chat' | 'quiz' | 'upload'>, ReactNode> = {
  read: (
    <>
      <path d="m20 42 55-7 61 8-5 48-56-9-48 8Z" fill="#171717" />
      <path d="M78 31C61 19 43 20 24 25l-3 57c21-5 38-3 55 8 18-11 36-13 57-8l4-57c-22-4-40-2-59 6Z" />
      <path d="m78 31-2 59m4-57c17-7 34-7 48-4m-96 7c12-1 24 0 36 5m-37 4c12-1 24 0 36 5m-36 4c12-1 24 0 36 5m-37 4c12-1 24 0 36 5m22-25c11-4 21-5 31-4m-31 13c11-4 21-5 31-4m-32 13c11-4 21-5 31-4m-32 13c11-4 21-5 31-4" />
    </>
  ),
  flashcards: (
    <>
      <path d="m42 20 68 4-5 74-68-4Z" />
      <path d="m33 29 70-9 10 74-70 9Z" />
      <path d="m49 13 61 27-29 67-61-27Z" />
      <path d="m70 39-21 16 17 8-13 19 31-18-17-8 14-12Z" fill="#171717" />
      <path d="m29 89 50 22m34-70 3 6" />
    </>
  ),
  audio: (
    <>
      <path d="M40 64V52c0-26 16-40 40-40s40 15 40 40v15h-10V51c0-19-11-29-30-29S50 32 50 51v14Z" />
      <path d="M39 54c-10 0-15 9-15 21s6 21 16 21h8V54Zm82 0c10 0 15 9 15 21s-6 21-16 21h-8V54Z" />
      <path d="M41 55v40m78-40v40m-57-37v19m9-28v37m10-44v52m10-43v35m10-27v19" strokeWidth="3" />
    </>
  ),
  tutor: (
    <>
      <path d="m39 39 43-21 43 21-43 20Z" fill="#171717" />
      <path d="M49 46v21c20 13 43 13 62-1V45M125 40v28m-3 0h6v14h-6Z" />
      <path d="M64 69v20l18 12 17-12V69" />
      <path d="m55 80-23 9-5 17h110l-6-17-23-9-26 21Z" />
      <path d="m81 101-4-10 5-6 5 6-4 10m-23-17 10 10m32-10-10 10" />
    </>
  ),
  record: (
    <>
      <path d="M63 31a17 17 0 0 1 34 0v34a17 17 0 0 1-34 0Z" />
      <path d="M53 59v7a27 27 0 0 0 54 0v-7M80 93v14m-20 0h40M64 35h12m9 0h12M64 43h12m9 0h12M64 51h12m9 0h12" />
      <path d="M35 45v25m-10-18v11m100-18v25m10-18v11" strokeWidth="3" />
    </>
  ),
  arcade: (
    <>
      <path d="M53 38h54c13 0 22 15 29 42 5 21-9 29-22 14L99 79H61L45 95C31 108 20 98 25 80c8-28 15-42 28-42Z" />
      <path d="M51 49h10v11h11v10H61v11H51V70H40V60h11Z" />
      <circle cx="108" cy="54" r="5" fill="#171717" />
      <circle cx="119" cy="67" r="5" fill="#171717" />
      <path d="M80 38V26c0-13 24-9 24-20M76 69h7m3 0h7" />
    </>
  ),
  apps: (
    <>
      <g transform="rotate(-9 52 45)">
        <rect x="23" y="21" width="49" height="48" rx="10" />
        <path d="m39 44 8-10 9 10-9 10Z" />
      </g>
      <g transform="rotate(9 111 47)">
        <rect x="83" y="19" width="49" height="48" rx="10" />
        <path d="M95 42h24m-12-12v24" />
      </g>
      <g transform="rotate(-5 82 80)">
        <rect x="56" y="56" width="51" height="49" rx="10" />
        <path d="m68 78 13-9 13 9-13 13Zm0 7 13 9 13-9" />
      </g>
    </>
  ),
  set: (
    <>
      <path
        d="M26 20Q26 16 32 16L124 16Q130 16 130 22L128 88Q128 94 121 94L31 92Q25 92 25 86Z"
        fill="#bceff0"
        strokeWidth="3"
      />
      <path
        d="m35 73 20-30 18 23 12-14 12 21M103 32h15m-15 15h15m-15 15h15M66 94v17m26-17v17m-34 0h42"
        strokeWidth="3"
      />
      <circle cx="81" cy="35" r="6" strokeWidth="3" />
    </>
  ),
};

export function ToolIllustration({ kind, className }: ToolIllustrationProps) {
  if (kind === 'upload')
    return (
      <svg viewBox="0 0 160 100" className={className} aria-hidden="true" focusable="false">
        <image href="/reference-art/upload-materials.svg" width="160" height="100" />
      </svg>
    );
  if (kind === 'chat' || kind === 'quiz')
    return (
      <svg viewBox="0 0 160 124" className={className} aria-hidden="true" focusable="false">
        <image href={`/reference-art/${kind}.svg`} y="-18" width="160" height="160" />
      </svg>
    );
  return (
    <svg
      viewBox="0 0 160 124"
      fill="white"
      stroke="#171717"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="81" cy="110" rx="53" ry="6" fill="#171717" stroke="none" />
      {artwork[kind]}
    </svg>
  );
}

export function Mascot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
      <image href="/reference-art/sparky-avatar.svg" width="100" height="100" />
    </svg>
  );
}
