function on_send() {
console.log("LATEX OK *********");
  var retVals = window.arguments[0];
  retVals.action = 1;
  close();
}

function on_cancel() {
console.log("LATEX Cancel *********");
  var retVals = window.arguments[0]
  retVals.action = -1;
  close();
}

function on_removeandsend(event) {
console.log("LATEX Remove and send *********");
  var retVals = window.arguments[0]
  retVals.action = 0;
  close();
}
