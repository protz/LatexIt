function pick_file(pref, title) {
  let nsIFilePicker = Components.interfaces.nsIFilePicker;
  let fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.init(window, "Select the "+title+" binary", nsIFilePicker.modeOpen);
  if (fp.show() == nsIFilePicker.returnOK)
    pref.value = fp.file.path;
}
