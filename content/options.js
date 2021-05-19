var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

// I used LatexIt to implement and test these functions. Left it in as
// a working example for ping-pong communication.
let onNotifyLegacyObserver = {
 observe: function (aSubject, aTopic, aData) {
   if (aData != "tblatex@xulforum.org") {
     return;
   }
   console.log(aSubject.wrappedJSObject);
 }
}
window.addEventListener("load", function (event) {
  Services.obs.addObserver(onNotifyLegacyObserver, "WindowListenerNotifyLegacyObserver", false);
  window.addEventListener("unload", function (event) {
    Services.obs.removeObserver(onNotifyLegacyObserver, "WindowListenerNotifyLegacyObserver");
  }, false);
}, false);

function pick_file(textboxId, title) {
  var nsIFilePicker = Components.interfaces.nsIFilePicker;
  var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.init(window, "Select the "+title+" binary", nsIFilePicker.modeOpen);

  fp.open(rv => {
    if( rv != nsIFilePicker.returnOK) {
      return;
    }
    document.getElementById(textboxId).value = fp.file.path;
  });
}

function open_autodetect() {
  // Notify WebExtension Background to open the first run tab.
  Services.obs.notifyObservers(
    {command: "openFirstRunTab"},
    "WindowListenerNotifyBackgroundObserver",
    "tblatex@xulforum.org");
}

window.addEventListener("load", function (event) {
  on_log();
}, false);

function on_log() {
  document.getElementById("debug_checkbox").disabled = !document.getElementById("log_checkbox").checked;
}
