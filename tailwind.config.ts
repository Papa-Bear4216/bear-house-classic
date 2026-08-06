import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))'
        },
        // Brand palette — all flip with the theme via CSS variables in
        // index.css (:root = light, .dark = dark values). Dark-mode values
        // are identical to the old literal hex; light-mode accent values
        // are unverified visually (no browser access) pending a human
        // eyeball pass. bark/cream invert as a pair (surface/on-surface);
        // honey/sage/berry/stone shift darker in light mode for contrast.
        honey: {
          50: 'rgb(var(--honey-50) / <alpha-value>)',
          100: 'rgb(var(--honey-100) / <alpha-value>)',
          200: 'rgb(var(--honey-200) / <alpha-value>)',
          400: 'rgb(var(--honey-400) / <alpha-value>)',
          500: 'rgb(var(--honey-500) / <alpha-value>)',
          600: 'rgb(var(--honey-600) / <alpha-value>)',
          700: 'rgb(var(--honey-700) / <alpha-value>)',
        },
        bark: {
          700: 'rgb(var(--bark-700) / <alpha-value>)',
          800: 'rgb(var(--bark-800) / <alpha-value>)',
        },
        cream: {
          50: 'rgb(var(--cream-50) / <alpha-value>)',
          100: 'rgb(var(--cream-100) / <alpha-value>)',
          200: 'rgb(var(--cream-200) / <alpha-value>)',
          400: 'rgb(var(--cream-400) / <alpha-value>)',
        },
        sage: {
          50: 'rgb(var(--sage-50) / <alpha-value>)',
          100: 'rgb(var(--sage-100) / <alpha-value>)',
          200: 'rgb(var(--sage-200) / <alpha-value>)',
          500: 'rgb(var(--sage-500) / <alpha-value>)',
          600: 'rgb(var(--sage-600) / <alpha-value>)',
        },
        berry: {
          400: 'rgb(var(--berry-400) / <alpha-value>)',
          500: 'rgb(var(--berry-500) / <alpha-value>)',
          600: 'rgb(var(--berry-600) / <alpha-value>)',
        },
        stone: {
          300: 'rgb(var(--stone-300) / <alpha-value>)',
          500: 'rgb(var(--stone-500) / <alpha-value>)',
        },
        // Overrides (not additions) to Tailwind's built-in slate scale —
        // theme.extend.colors merges per-key, so only these 9 shades are
        // replaced; any slate shade not listed here keeps Tailwind's fixed
        // default (none currently used, per the app-wide usage audit).
        slate: {
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          300: 'rgb(var(--slate-300) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)',
          500: 'rgb(var(--slate-500) / <alpha-value>)',
          600: 'rgb(var(--slate-600) / <alpha-value>)',
          700: 'rgb(var(--slate-700) / <alpha-value>)',
          800: 'rgb(var(--slate-800) / <alpha-value>)',
          900: 'rgb(var(--slate-900) / <alpha-value>)',
          950: 'rgb(var(--slate-950) / <alpha-value>)',
        },
        red: {
          50: 'rgb(var(--red-50) / <alpha-value>)',
          300: 'rgb(var(--red-300) / <alpha-value>)',
          400: 'rgb(var(--red-400) / <alpha-value>)',
          600: 'rgb(var(--red-600) / <alpha-value>)',
        },
        orange: {
          200: 'rgb(var(--orange-200) / <alpha-value>)',
          300: 'rgb(var(--orange-300) / <alpha-value>)',
          400: 'rgb(var(--orange-400) / <alpha-value>)',
          500: 'rgb(var(--orange-500) / <alpha-value>)',
          600: 'rgb(var(--orange-600) / <alpha-value>)',
          700: 'rgb(var(--orange-700) / <alpha-value>)',
          900: 'rgb(var(--orange-900) / <alpha-value>)',
          950: 'rgb(var(--orange-950) / <alpha-value>)',
        },
        amber: {
          200: 'rgb(var(--amber-200) / <alpha-value>)',
          300: 'rgb(var(--amber-300) / <alpha-value>)',
          400: 'rgb(var(--amber-400) / <alpha-value>)',
          500: 'rgb(var(--amber-500) / <alpha-value>)',
          900: 'rgb(var(--amber-900) / <alpha-value>)',
        },
        yellow: {
          50: 'rgb(var(--yellow-50) / <alpha-value>)',
          300: 'rgb(var(--yellow-300) / <alpha-value>)',
          400: 'rgb(var(--yellow-400) / <alpha-value>)',
          500: 'rgb(var(--yellow-500) / <alpha-value>)',
          600: 'rgb(var(--yellow-600) / <alpha-value>)',
          700: 'rgb(var(--yellow-700) / <alpha-value>)',
          900: 'rgb(var(--yellow-900) / <alpha-value>)',
          950: 'rgb(var(--yellow-950) / <alpha-value>)',
        },
        green: {
          50: 'rgb(var(--green-50) / <alpha-value>)',
          300: 'rgb(var(--green-300) / <alpha-value>)',
          400: 'rgb(var(--green-400) / <alpha-value>)',
          500: 'rgb(var(--green-500) / <alpha-value>)',
          600: 'rgb(var(--green-600) / <alpha-value>)',
          700: 'rgb(var(--green-700) / <alpha-value>)',
          900: 'rgb(var(--green-900) / <alpha-value>)',
          950: 'rgb(var(--green-950) / <alpha-value>)',
        },
        emerald: {
          200: 'rgb(var(--emerald-200) / <alpha-value>)',
          300: 'rgb(var(--emerald-300) / <alpha-value>)',
          400: 'rgb(var(--emerald-400) / <alpha-value>)',
          500: 'rgb(var(--emerald-500) / <alpha-value>)',
          600: 'rgb(var(--emerald-600) / <alpha-value>)',
          700: 'rgb(var(--emerald-700) / <alpha-value>)',
          900: 'rgb(var(--emerald-900) / <alpha-value>)',
          950: 'rgb(var(--emerald-950) / <alpha-value>)',
        },
        teal: {
          300: 'rgb(var(--teal-300) / <alpha-value>)',
          400: 'rgb(var(--teal-400) / <alpha-value>)',
          600: 'rgb(var(--teal-600) / <alpha-value>)',
          700: 'rgb(var(--teal-700) / <alpha-value>)',
          900: 'rgb(var(--teal-900) / <alpha-value>)',
        },
        cyan: {
          400: 'rgb(var(--cyan-400) / <alpha-value>)',
          500: 'rgb(var(--cyan-500) / <alpha-value>)',
          900: 'rgb(var(--cyan-900) / <alpha-value>)',
        },
        sky: {
          200: 'rgb(var(--sky-200) / <alpha-value>)',
          300: 'rgb(var(--sky-300) / <alpha-value>)',
          400: 'rgb(var(--sky-400) / <alpha-value>)',
          500: 'rgb(var(--sky-500) / <alpha-value>)',
          600: 'rgb(var(--sky-600) / <alpha-value>)',
          700: 'rgb(var(--sky-700) / <alpha-value>)',
          900: 'rgb(var(--sky-900) / <alpha-value>)',
          950: 'rgb(var(--sky-950) / <alpha-value>)',
        },
        blue: {
          200: 'rgb(var(--blue-200) / <alpha-value>)',
          300: 'rgb(var(--blue-300) / <alpha-value>)',
          400: 'rgb(var(--blue-400) / <alpha-value>)',
          500: 'rgb(var(--blue-500) / <alpha-value>)',
          600: 'rgb(var(--blue-600) / <alpha-value>)',
          900: 'rgb(var(--blue-900) / <alpha-value>)',
        },
        indigo: {
          200: 'rgb(var(--indigo-200) / <alpha-value>)',
          300: 'rgb(var(--indigo-300) / <alpha-value>)',
          400: 'rgb(var(--indigo-400) / <alpha-value>)',
          500: 'rgb(var(--indigo-500) / <alpha-value>)',
          600: 'rgb(var(--indigo-600) / <alpha-value>)',
          900: 'rgb(var(--indigo-900) / <alpha-value>)',
          950: 'rgb(var(--indigo-950) / <alpha-value>)',
        },
        violet: {
          300: 'rgb(var(--violet-300) / <alpha-value>)',
          400: 'rgb(var(--violet-400) / <alpha-value>)',
          500: 'rgb(var(--violet-500) / <alpha-value>)',
          600: 'rgb(var(--violet-600) / <alpha-value>)',
          900: 'rgb(var(--violet-900) / <alpha-value>)',
          950: 'rgb(var(--violet-950) / <alpha-value>)',
        },
        purple: {
          400: 'rgb(var(--purple-400) / <alpha-value>)',
          500: 'rgb(var(--purple-500) / <alpha-value>)',
          600: 'rgb(var(--purple-600) / <alpha-value>)',
          900: 'rgb(var(--purple-900) / <alpha-value>)',
          950: 'rgb(var(--purple-950) / <alpha-value>)',
        },
        pink: {
          400: 'rgb(var(--pink-400) / <alpha-value>)',
          500: 'rgb(var(--pink-500) / <alpha-value>)',
          900: 'rgb(var(--pink-900) / <alpha-value>)',
        },
        rose: {
          200: 'rgb(var(--rose-200) / <alpha-value>)',
          300: 'rgb(var(--rose-300) / <alpha-value>)',
          400: 'rgb(var(--rose-400) / <alpha-value>)',
          500: 'rgb(var(--rose-500) / <alpha-value>)',
          600: 'rgb(var(--rose-600) / <alpha-value>)',
          700: 'rgb(var(--rose-700) / <alpha-value>)',
          800: 'rgb(var(--rose-800) / <alpha-value>)',
          900: 'rgb(var(--rose-900) / <alpha-value>)',
          950: 'rgb(var(--rose-950) / <alpha-value>)',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'sans-serif'],
        display: ['Sora', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: 'calc(var(--radius) + 2px)',
        md: 'var(--radius)',
        sm: 'calc(var(--radius) - 2px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-in': {
          from: { transform: 'translateY(10px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
          },
        },
      },
    }
  },
  plugins: [
    animate,
    typography,
  ],
} satisfies Config;
