(function () {
  var isOSX = ("nsILocalFileMac" in Components.interfaces);
  var Cc = Components.classes;
  var Ci = Components.interfaces;

  if (isOSX) {
    var env = Cc["@mozilla.org/process/environment;1"].createInstance(Ci.nsIEnvironment);
    var paths = env.get("PATH").split(":");
    var suggestions = [
      "/usr/local/bin",
      "/usr/texbin",
      "/usr/X11/bin"
    ];
    for (var i = 0; i < suggestions.length; ++i) {
      if (paths.indexOf(suggestions[i]) < 0)
        paths.push(suggestions[i]);
    }
    env.set("PATH", paths.join(":"));
    dump("New path: "+env.get("PATH")+"\n");
  }
})();
