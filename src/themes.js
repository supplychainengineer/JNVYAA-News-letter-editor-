// Design themes. Each theme is a font pairing, a palette and a few layout
// choices (masthead style, corner radius, drop caps). The renderer turns these
// into CSS custom properties, so adding a theme means adding an entry here.

export const THEMES = {
  heritage: {
    label: 'Heritage',
    description: 'Maroon & gold, classic serif. Great for schools and alumni.',
    fonts: {
      display: "'Cormorant Garamond', Georgia, serif",
      body: "'Lato', 'Helvetica Neue', Arial, sans-serif",
      families: ['Cormorant+Garamond:ital,wght@0,600;0,700;1,500', 'Lato:wght@400;700'],
    },
    colors: {
      bg: '#ece3d4', paper: '#fffdf8', ink: '#2a1a17', muted: '#6d5a52',
      accent: '#7a1f2b', accent2: '#b8892d', soft: '#f6ecdf', line: '#e6d8c4', onAccent: '#fff8ec',
    },
    mast: 'framed', radius: '0px', dropCap: true, displayWeight: 700, headingScale: 1.18,
  },
  editorial: {
    label: 'Editorial',
    description: 'Magazine serif on cream paper with a terracotta accent.',
    fonts: {
      display: "'Playfair Display', Georgia, serif",
      body: "'Inter', system-ui, sans-serif",
      families: ['Playfair+Display:ital,wght@0,600;0,800;1,500', 'Inter:wght@400;500;600;700'],
    },
    colors: {
      bg: '#e9e4da', paper: '#fbf8f2', ink: '#1c1917', muted: '#6b635a',
      accent: '#b4441c', accent2: '#1c1917', soft: '#f2ebdf', line: '#ddd3c4', onAccent: '#ffffff',
    },
    mast: 'stacked', radius: '2px', dropCap: true, displayWeight: 800, headingScale: 1,
  },
  modern: {
    label: 'Modern',
    description: 'Clean sans-serif, rounded cards, bright blue.',
    fonts: {
      display: "'Plus Jakarta Sans', system-ui, sans-serif",
      body: "'Inter', system-ui, sans-serif",
      families: ['Plus+Jakarta+Sans:wght@500;700;800', 'Inter:wght@400;500;600;700'],
    },
    colors: {
      bg: '#e8edf5', paper: '#ffffff', ink: '#0f172a', muted: '#5b6678',
      accent: '#2557e8', accent2: '#f97362', soft: '#eef3ff', line: '#e3e8f0', onAccent: '#ffffff',
    },
    mast: 'overlay', radius: '16px', dropCap: false, displayWeight: 800, headingScale: 0.92,
  },
  fresh: {
    label: 'Fresh',
    description: 'Teal and amber with a friendly serif. Community & nonprofit.',
    fonts: {
      display: "'DM Serif Display', Georgia, serif",
      body: "'DM Sans', system-ui, sans-serif",
      families: ['DM+Serif+Display:ital@0;1', 'DM+Sans:wght@400;500;700'],
    },
    colors: {
      bg: '#dcebe3', paper: '#ffffff', ink: '#12312a', muted: '#55706a',
      accent: '#0f766e', accent2: '#e8930c', soft: '#edf6f1', line: '#dbe9e2', onAccent: '#ffffff',
    },
    mast: 'split', radius: '20px', dropCap: false, displayWeight: 400, headingScale: 1.05,
  },
  bold: {
    label: 'Bold',
    description: 'Dark canvas, grotesk type, electric lime.',
    fonts: {
      display: "'Space Grotesk', system-ui, sans-serif",
      body: "'Inter', system-ui, sans-serif",
      families: ['Space+Grotesk:wght@500;700', 'Inter:wght@400;500;600;700'],
    },
    colors: {
      bg: '#05070d', paper: '#0e1320', ink: '#f2f4f8', muted: '#9aa3b5',
      accent: '#c6f432', accent2: '#7c9cff', soft: '#171e2f', line: '#232c40', onAccent: '#0b0f1a',
    },
    mast: 'overlay', radius: '12px', dropCap: false, displayWeight: 700, headingScale: 0.95, upper: true,
  },
  minimal: {
    label: 'Minimal',
    description: 'Black & white with a single red accent. Lots of air.',
    fonts: {
      display: "'Fraunces', Georgia, serif",
      body: "'IBM Plex Sans', system-ui, sans-serif",
      families: ['Fraunces:ital,wght@0,400;0,700;1,400', 'IBM+Plex+Sans:wght@400;500;600'],
    },
    colors: {
      bg: '#f0f0ee', paper: '#ffffff', ink: '#111111', muted: '#6a6a6a',
      accent: '#e11d48', accent2: '#111111', soft: '#f6f6f4', line: '#e7e7e4', onAccent: '#ffffff',
    },
    mast: 'stacked', radius: '0px', dropCap: false, displayWeight: 700, headingScale: 1,
  },
};

export const DEFAULT_THEME = 'heritage';

export function getTheme(name) {
  return THEMES[String(name || '').toLowerCase()] || THEMES[DEFAULT_THEME];
}

export function fontHref(theme) {
  return 'https://fonts.googleapis.com/css2?' +
    theme.fonts.families.map((f) => 'family=' + f).join('&') + '&display=swap';
}
