function on_ok() {
  var latex = document.getElementById("tblatex-expr").value;
  window.arguments[0](latex);
}

window.addEventListener("load", function (event) {
  var marker = "__REPLACEME__";
  var textarea = document.getElementById("tblatex-expr");
  textarea.value = window.arguments[1];
  var start = textarea.value.indexOf(marker);
  textarea.focus();
  if (start > -1)
    textarea.setSelectionRange(start, start+marker.length);
}, false);

var prefs = Components.classes["@mozilla.org/preferences-service;1"]
  .getService(Components.interfaces.nsIPrefService)
  .getBranch("tblatex.");

function on_reset() {
  document.getElementById("tblatex-expr").value = prefs.getCharPref("template");
}
