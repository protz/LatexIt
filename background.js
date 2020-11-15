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
   
  messenger.WindowListener.registerStartupScript(
    "chrome://tblatex/content/scripts/startup.js");
  
  messenger.WindowListener.registerWindow(
    "chrome://messenger/content/messenger.xhtml",
    "chrome://tblatex/content/scripts/messenger_firstrun.js");
      
  messenger.WindowListener.registerWindow(
    "chrome://messenger/content/messengercompose/messengercompose.xhtml",
    "chrome://tblatex/content/scripts/messengercompose.js");
  
  messenger.WindowListener.registerWindow(
    "chrome://messenger/content/customizeToolbar.xhtml",
    "chrome://tblatex/content/scripts/customizeToolbar.js");
    
  messenger.WindowListener.startListening();
})();
