function on_ok() {
  var latex = document.getElementById("tblatex-expr").value;
  window.arguments[0](latex);
}

window.addEventListener("load", function (event) {
  document.getElementById("tblatex-expr").value = window.arguments[1];
}, false);

var prefs = Components.classes["@mozilla.org/preferences-service;1"]
  .getService(Components.interfaces.nsIPrefService)
  .getBranch("tblatex.");

function on_reset() {
  document.getElementById("tblatex-expr").value = prefs.getCharPref("template");
}
