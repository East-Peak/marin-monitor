import type { ViewerMark } from '$lib/dashboard/cam-viewer-url';

declare global {
	namespace App {
		/** Shallow-routing state (`pushState`): the camera viewer's mark (CAMVIEW1). */
		interface PageState {
			camViewer?: ViewerMark;
		}
	}
}

export {};
