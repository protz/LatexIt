/*
 * The WL API may only be called from the background script, so when we wish to call
 * openOptionsDialog we need to tunnel the request though the messaging system.
 */
messenger.runtime.onMessage.addListener((data, sender) => {
  switch (data.command) {
    case "openOptionsDialog":
      messenger.WindowListener.openOptionsDialog(data.windowId);
      break;
    case "closeFirstRunTab":
      messenger.tabs.remove(sender.tab.id);
      break;
  }
});



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
    messenger.tabs.create({
      url: "content/firstrun.html"
    });
  }
  
})();

