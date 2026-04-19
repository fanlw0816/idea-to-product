/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Role colors (from CSS variables)
        'role-trendhunter': 'var(--role-trendhunter)',
        'role-uservoice': 'var(--role-uservoice)',
        'role-engineer': 'var(--role-engineer)',
        'role-deviladvocate': 'var(--role-deviladvocate)',
        'role-minimalist': 'var(--role-minimalist)',
        'role-philosopher': 'var(--role-philosopher)',
        'role-moderator': 'var(--role-moderator)',
        'role-system': 'var(--role-system)',
        // Agent colors
        'role-designer': 'var(--role-philosopher)',
        'role-reviewer': 'var(--color-warning)',
        'role-deployer': 'var(--color-success)',
        // Semantic colors
        'arena-bg': 'var(--surface-base)',
        'arena-card': 'var(--surface-card)',
        'arena-border': 'var(--surface-border)',
        'arena-elevated': 'var(--surface-elevated)',
        'arena-text': 'var(--text-primary)',
        'arena-text-secondary': 'var(--text-secondary)',
        'arena-text-muted': 'var(--text-muted)',
        // Status colors
        'arena-success': 'var(--color-success)',
        'arena-warning': 'var(--color-warning)',
        'arena-error': 'var(--color-error)',
        'arena-info': 'var(--color-info)',
        // Phase colors
        'phase-idea': 'var(--phase-idea)',
        'phase-design': 'var(--phase-design)',
        'phase-build': 'var(--phase-build)',
        'phase-review': 'var(--phase-review)',
        'phase-deploy': 'var(--phase-deploy)',
      },
      spacing: {
        'arena-1': 'var(--space-1)',
        'arena-2': 'var(--space-2)',
        'arena-3': 'var(--space-3)',
        'arena-4': 'var(--space-4)',
        'arena-5': 'var(--space-5)',
        'arena-6': 'var(--space-6)',
      },
      fontSize: {
        'arena-xs': 'var(--text-xs)',
        'arena-sm': 'var(--text-sm)',
        'arena-base': 'var(--text-base)',
        'arena-lg': 'var(--text-lg)',
        'arena-xl': 'var(--text-xl)',
      },
      transitionDuration: {
        'arena-fast': 'var(--duration-fast)',
        'arena-normal': 'var(--duration-normal)',
        'arena-slow': 'var(--duration-slow)',
      },
    },
  },
  plugins: [],
};