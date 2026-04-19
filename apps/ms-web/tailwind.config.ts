import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#6366F1',
          dark: '#4F46E5',
          light: '#818CF8',
        },
        secondary: '#10B981',
        accent: '#F59E0B',
        danger: '#EF4444',
        background: {
          primary: '#0F172A',
          secondary: '#1E293B',
          tertiary: '#334155',
        },
        text: {
          primary: '#F8FAFC',
          secondary: '#94A3B8',
          muted: '#64748B',
        },
        border: '#334155',
      },
    },
  },
  plugins: [],
};

export default config;
