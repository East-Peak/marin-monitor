/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				bg: '#050a14',
				surface: 'rgba(20, 25, 40, 0.65)',
				'surface-hover': 'rgba(30, 38, 55, 0.75)',
				border: 'rgba(255, 255, 255, 0.08)',
				'border-light': 'rgba(255, 255, 255, 0.15)',
				'text-primary': '#f1f5f9',
				'text-dim': '#94a3b8',
				'text-muted': '#64748b',
				accent: '#38bdf8',
				danger: '#ef4444',
				success: '#10b981',
				warning: '#f59e0b',
				info: '#3b82f6'
			},
			fontFamily: {
				sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
				mono: ['Geist Mono', 'SF Mono', 'Fira Code', 'monospace']
			},
			fontSize: {
				'2xs': '0.65rem'
			},
			animation: {
				shimmer: 'shimmer 2s infinite linear',
				'fade-in': 'fadeIn 0.3s ease-out'
			},
			keyframes: {
				shimmer: {
					'0%': { backgroundPosition: '-200% 0' },
					'100%': { backgroundPosition: '200% 0' }
				},
				fadeIn: {
					'0%': { opacity: '0', transform: 'translateY(5px)' },
					'100%': { opacity: '1', transform: 'translateY(0)' }
				}
			},
			backdropBlur: {
				xs: '2px',
			}
		}
	},
	plugins: []
};
