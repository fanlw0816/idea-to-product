/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Arena roles
        'role-trendhunter': '#ff6b6b',
        'role-uservoice': '#4ecdc4',
        'role-engineer': '#45b7d1',
        'role-deviladvocate': '#e94560',
        'role-minimalist': '#feca57',
        'role-philosopher': '#a78bfa',
        // Pipeline agents
        'role-designer': '#a78bfa',
        'role-reviewer': '#fb923c',
        'role-deployer': '#34d399',
        'role-moderator': '#e94560',
        // UI
        'arena-bg': '#0f0f1a',
        'arena-card': '#1a1a2e',
        'arena-border': '#16213e',
      },
    },
  },
  plugins: [],
};