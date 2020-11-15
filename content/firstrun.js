(function () {
    var { latexit } = ChromeUtils.import("chrome://tblatex/content/legacy/latexit.jsm");
    console.log(latexit.preferences.getPref("test", "missing"));
    
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefService)
      .getBranch("tblatex.");
    if (prefs.getIntPref("firstrun") == 3)
      return;

    var tabmail = document.getElementById("tabmail");
    if (tabmail && 'openTab' in tabmail) /* Took this from Personas code ("Browse gallery"...) */
      Components.classes['@mozilla.org/appshell/window-mediator;1'].
        getService(Components.interfaces.nsIWindowMediator).
        getMostRecentWindow("mail:3pane").
      document.getElementById("tabmail").
      openTab("contentTab", { contentPage: "chrome://tblatex/content/firstrun.html" });
    else
      openDialog("chrome://tblatex/content/firstrun.html", "", "width=640,height=480");
})();
