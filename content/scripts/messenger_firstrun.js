// Import any needed modules.
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

// Load an additional JavaScript file.
Services.scriptloader.loadSubScript("chrome://tblatex/content/firstrun.js", window, "UTF-8");
Services.scriptloader.loadSubScript("chrome://tblatex/content/osx-path-hacks.js", window, "UTF-8");

function onLoad(activatedWhileWindowOpen) {
}

function onUnload(deactivatedWhileWindowOpen) {
}