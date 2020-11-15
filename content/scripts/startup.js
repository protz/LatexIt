var { latexit } = ChromeUtils.import("chrome://tblatex/content/legacy/latexit.jsm");

async function startup() {
	// inject WebExtension messenger object into JSM
	latexit.messenger = WL.messenger;
	// Load preferences asynchronously from WebExtension storage into a local
	// obj into the global JSM. We could do this in onLoad() for every window
	// we are opening, or once for a global JSM.
	await latexit.preferences.init();
}
