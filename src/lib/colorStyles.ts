interface ColorStyle {
  card: string;
  text: string;
}

const DEFAULT_STYLE: ColorStyle = {
  card: 'bg-gradient-to-br from-honey-700/30 to-bark-800 border border-honey-500/30',
  text: 'text-honey-200',
};

export const COLOR_CARD_STYLES: Record<string, ColorStyle> = {
  indigo: {
    card: 'bg-gradient-to-br from-berry-700/30 to-bark-800 border border-berry-500/30',
    text: 'text-berry-300',
  },
  pink: {
    card: 'bg-gradient-to-br from-berry-700/30 to-bark-800 border border-berry-500/30',
    text: 'text-berry-300',
  },
  purple: {
    card: 'bg-gradient-to-br from-berry-700/30 to-bark-800 border border-berry-500/30',
    text: 'text-berry-300',
  },
  blue: {
    card: 'bg-gradient-to-br from-sky-900/30 to-bark-800 border border-sky-500/30',
    text: 'text-sky-300',
  },
  green: {
    card: 'bg-gradient-to-br from-sage-600/30 to-bark-800 border border-sage-500/30',
    text: 'text-sage-200',
  },
  emerald: {
    card: 'bg-gradient-to-br from-sage-600/30 to-bark-800 border border-sage-500/30',
    text: 'text-sage-200',
  },
  orange: {
    card: 'bg-gradient-to-br from-honey-700/30 to-bark-800 border border-honey-500/30',
    text: 'text-honey-200',
  },
};

export function getColorCardStyle(color: string): ColorStyle {
  return COLOR_CARD_STYLES[color] || DEFAULT_STYLE;
}
