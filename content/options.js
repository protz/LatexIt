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

async function open_autodetect() {
  notifyTools.notifyBackground({command: "openFirstRunTab"});
}

window.addEventListener("load", function (event) {
  on_log();
}, false);

function on_log() {
  document.getElementById("debug_checkbox").disabled = !document.getElementById("log_checkbox").checked;
}
