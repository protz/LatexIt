/*
 * The WL API may only be called from the background script, so when we wish to call
 * openOptionsDialog we need to tunnel the request though the messaging system.
 */
messenger.runtime.onMessage.addListener((info, sender) => {
  switch (info.command) {
    case "openOptionsDialog":
      messenger.WindowListener.openOptionsDialog(info.windowId);
      break;
    case "closeFirstRunTab":
      messenger.tabs.remove(sender.tab.id);
      break;
    case "openFirstRunTab":
      openFirstRunTab();
      break;
  }
});


/*
 * Register a onNotify listener to catch messages send from privileged scope.
*/
messenger.WindowListener.onNotify.addListener((info) => {
  switch (info.command) {
    case "openFirstRunTab":
      openFirstRunTab();
      break;
  }
});


function openFirstRunTab() {
  messenger.tabs.create({
    url: "content/firstrun.html"
  });
}


(async () => { 
  messenger.WindowListener.registerDefaultPrefs(
    "defaults/preferences/defaults.js");
  
  // load add-on via WindowListener API
  messenger.WindowListener.registerChromeUrl([ 
    ["content",   "tblatex",       "content/"],
    ["resource",  "tblatex-skin",  "skin/"],
  ]);

  messenger.WindowListener.registerOptionsPage(
    "chrome://tblatex/content/options.xhtml");
      
  messenger.WindowListener.registerWindow(
    "chrome://messenger/content/messengercompose/messengercompose.xhtml",
    "chrome://tblatex/content/scripts/messengercompose.js");
  
  messenger.WindowListener.registerWindow(
    "chrome://messenger/content/customizeToolbar.xhtml",
    "chrome://tblatex/content/scripts/customizeToolbar.js");
    
  messenger.WindowListener.startListening();
  
  // Check if the first run tab has to be shown.
  let firstrun = await messenger.LegacyPrefs.getPref("tblatex.firstrun");
  if (firstrun != 3) {
    openFirstRunTab();
  }
  
})();

