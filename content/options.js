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

function pick_file(pref, title) {
  var nsIFilePicker = Components.interfaces.nsIFilePicker;
  var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.init(window, "Select the "+title+" binary", nsIFilePicker.modeOpen);

  fp.open(rv => {
    if( rv != nsIFilePicker.returnOK) {
      return;
    }
    pref.value = fp.file.path;
  });
}

function add_links(aDoc) {
  if (!window.Application) //TB 2.x will open this properly in an external browser
    return;

  var links = aDoc.getElementsByClassName("external");
  for (var i = 0; i < links.length; ++i) (function (i) {
    dump("link "+i+"\n");
    var uri = links[i].getAttribute("href");
    links[i].addEventListener("click",
      function link_listener (event) {
        if (!(uri instanceof Components.interfaces.nsIURI))
          uri = Components.classes["@mozilla.org/network/io-service;1"]
            .getService(Components.interfaces.nsIIOService)
            .newURI(uri, null, null);

        Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
          .getService(Components.interfaces.nsIExternalProtocolService)
          .loadURI(uri);

        event.preventDefault();
      }, true);
  })(i);
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
