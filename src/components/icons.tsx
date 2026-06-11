// Small, consistent stroke icons (currentColor) used across the reader chrome.
import type { SVGProps } from 'react';

function Svg({ size = 20, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export const ArrowLeftIcon = (p: { size?: number }) => (
  <Svg {...p}>
    <path d="M19 12H5" />
    <path d="M12 19l-7-7 7-7" />
  </Svg>
);

// A sidebar-panel glyph for the collapse/expand toggle (intentionally not an
// arrow, to avoid confusion with the "back" arrow).
export const PanelIcon = (p: { size?: number }) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
  </Svg>
);

export const ChevronLeftIcon = (p: { size?: number }) => (
  <Svg {...p}>
    <path d="M15 18l-6-6 6-6" />
  </Svg>
);

export const ChevronRightIcon = (p: { size?: number }) => (
  <Svg {...p}>
    <path d="M9 18l6-6-6-6" />
  </Svg>
);

export const BookIcon = (p: { size?: number }) => (
  <Svg {...p}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </Svg>
);

export const ChevronDownIcon = (p: { size?: number }) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const PlusIcon = (p: { size?: number }) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const TrashIcon = (p: { size?: number }) => (
  <Svg {...p}>
    <path d="M3 6h18" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </Svg>
);

export const HeadphonesIcon = (p: { size?: number }) => (
  <Svg {...p}>
    <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
    <path d="M18 19a2 2 0 0 0 2-2v-3h-3a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1zM6 19a2 2 0 0 1-2-2v-3h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1z" />
  </Svg>
);

export const FileTextIcon = (p: { size?: number }) => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M16 13H8M16 17H8M10 9H8" />
  </Svg>
);

export const AlertIcon = (p: { size?: number }) => (
  <Svg {...p}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Svg>
);

// "Locate" crosshair — jump/center the PDF on the audio's current position.
export const JumpIcon = (p: { size?: number }) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7" />
    <line x1="12" y1="2" x2="12" y2="5" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="2" y1="12" x2="5" y2="12" />
    <line x1="19" y1="12" x2="22" y2="12" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </Svg>
);

export const GearIcon = (p: { size?: number }) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H8a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V8a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Svg>
);
