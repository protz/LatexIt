(async () => { 

  messenger.WindowListener.registerDefaultPrefs("defaults/preferences/defaults.js");
  
  // load add-on via WindowListener API
  messenger.WindowListener.registerChromeUrl([ 
    ["content",   "tblatex",       "content/"],
    ["resource",  "tblatex-skin",  "skin/"],
  ]);

  messenger.WindowListener.registerOptionsPage("chrome://tblatex/content/options.xul");
   
  messenger.WindowListener.registerWindow(
    "chrome://messenger/content/messenger.xul",
    "chrome://tblatex/content/scripts/messenger_firstrun.js");
      
  messenger.WindowListener.registerWindow(
    "chrome://messenger/content/messengercompose/messengercompose.xul",
    "chrome://tblatex/content/scripts/messengercompose.js");
  
  messenger.WindowListener.registerWindow(
    "chrome://messenger/content/customizeToolbar.xul",
    "chrome://tblatex/content/scripts/customizeToolbar.js");
    
  messenger.WindowListener.startListening();
})();
