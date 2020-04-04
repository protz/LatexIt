function on_ok() {
  var latex = document.getElementById("tblatex-expr").value;
  var autodpi = document.getElementById("autodpi-checkbox").checked;
  var font_px = document.getElementById("fontpx").value;
  window.arguments[0](latex, autodpi, font_px);
}

function on_cancel() {
  window.close();
}

window.addEventListener("load", function (event) {
  var template = window.arguments[1];
  var selection = window.arguments[2];
  populate(template, selection);
  var autodpi = prefs.getBoolPref("autodpi");
  document.getElementById("autodpi-checkbox").checked = autodpi;
  update_ui(autodpi);
  var font_px = prefs.getIntPref("font_px");
  document.getElementById("fontpx").value = font_px;
}, false);

function on_reset() {
  var template = prefs.getCharPref("template");
  populate(template, null);
}

function on_autodpi() {
  var autodpi = document.getElementById("autodpi-checkbox").checked;
  update_ui(autodpi);
}

var prefs = Components.classes["@mozilla.org/preferences-service;1"]
  .getService(Components.interfaces.nsIPrefService)
  .getBranch("tblatex.");

function populate(template, selection) {
  var marker = "__REPLACE_ME__";
  var start = template.indexOf(marker);
  if (start > -1 && selection) {
    // Replace marker with selection
    template = template.substring(0, start) + selection + template.substring(start+marker.length)
    marker = selection;
  }

  var textarea = document.getElementById("tblatex-expr");
  textarea.value = template;
  textarea.focus();
  if (start > -1)
    // Select marker or selection
    textarea.setSelectionRange(start, start+marker.length);
}

function update_ui(autodpi) {
  document.getElementById("fontpx-label").disabled = autodpi;
  document.getElementById("fontpx").disabled = autodpi;
  document.getElementById("fontpx-unit").disabled = autodpi;
}
