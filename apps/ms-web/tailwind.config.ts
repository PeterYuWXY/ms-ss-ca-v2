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
          DEFAULT: '#E8724A',
          dark: '#C4522A',
          light: '#F5A882',
        },
        secondary: '#C4522A',
        accent: '#E8724A',
        danger: '#DC2626',
        background: {
          primary: '#FDFAF7',
          secondary: '#FAF6F2',
          tertiary: '#F5F0EB',
        },
        text: {
          primary: '#1A1208',
          secondary: '#4A3728',
          muted: '#8A7060',
        },
        border: '#EDE3DA',
      },
    },
  },
  plugins: [],
};

export default config;
