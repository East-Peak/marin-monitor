/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				bg: '#030712', // Darker, richer midnight base
				surface: 'rgba(15, 23, 42, 0.65)', // Deeper slate blue-tinted panels
				'surface-hover': 'rgba(30, 41, 59, 0.75)',
				border: 'rgba(56, 189, 248, 0.1)', // Subtle cool-blue borders
				'border-light': 'rgba(56, 189, 248, 0.2)',
				'text-primary': '#f8fafc',
				'text-dim': '#a8b8cc',
				'text-muted': '#7b8ba0',
				accent: '#0ea5e9', // Brighter, more vibrant ocean blue
				danger: '#ef4444',
				success: '#10b981',
				warning: '#f59e0b',
				info: '#3b82f6'
			},
			fontFamily: {
				sans: ['"Outfit Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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
