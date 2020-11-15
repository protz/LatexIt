var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var EXPORTED_SYMBOLS = ["latexit"];

var latexit = {
}

Services.scriptloader.loadSubScript("chrome://tblatex/content/scripts/preferences.js", latexit, "UTF-8");
