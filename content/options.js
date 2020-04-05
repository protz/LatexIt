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
  window.openDialog('chrome://tblatex/content/firstrun.html', '',
            'all,chrome,dialog=no,status,toolbar,width=640,height=480', add_links);
}

window.addEventListener("load", function (event) {
  on_log();
}, false);

function on_log() {
  document.getElementById("debug_checkbox").disabled = !document.getElementById("log_checkbox").checked;
}