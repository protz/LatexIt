function on_ok() {
  var latex = document.getElementById("tblatex-expr").value;
  window.arguments[0](latex);
}

function on_cancel() {
  window.close();
}

window.addEventListener("load", function (event) {
  document.getElementById("tblatex-expr").value = window.arguments[1];
}, false);
