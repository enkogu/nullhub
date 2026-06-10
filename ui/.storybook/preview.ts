import '../src/app.css';
import '../src/shadcn.css';

if (typeof document !== 'undefined') {
	document.body.classList.add('shadcn-app', 'theme-light', 'effects-disabled');
}

const preview = {
	parameters: {
		layout: 'centered',
		backgrounds: {
			default: 'light',
			values: [
				{ name: 'light', value: '#ffffff' },
				{ name: 'dark', value: '#111111' }
			]
		},
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i
			}
		}
	}
};

export default preview;
