var { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
  
function init_file (path) {
  var f = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  try {
    f.initWithPath(path);
  } catch (e) {
    dump("Wrong path! "+path+"\n");
    return {
      exists: function () { return false; }
    };
  }
  return f
}

var LatexIt = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {    
    
    return {
      LatexIt: {

        file_exists: async function(path) {
          let file = init_file(path);
          return file.exists();
        },
        
        search_in_path: async function(isWindows, extraEnvPathSuggestions) {
          var env = Cc["@mozilla.org/process/environment;1"].createInstance(Ci.nsIEnvironment);
          var sep = isWindows ? ";" : ":";
          var ext = isWindows ? ".exe" : "";
          var dirs = env.get("PATH").split(sep);

          // add suggestions to path
          let pathMod = false;
          for (let i = 0; i < extraEnvPathSuggestions.length; ++i) {
            if (dirs.indexOf(suggestions[i]) < 0) {
              dirs.push(suggestions[i]);
              pathMod = true;
            }
          }
          // Do we really have to CHANGE the path? We added the suggestions
          // for the search and store the full path found.
          if (pathMod) {
            env.set("PATH", dirs.join(sep));
            dump("New path: " + env.get("PATH") + "\n");
          }          
          
          let found = {};
          
          for (var i = 0; i < dirs.length; ++i) {
            var latex_bin = init_file(dirs[i]);
            if (latex_bin.exists()) {
              latex_bin.append("latex"+ext);
              if (latex_bin.exists()) {
                found.latex = latex_bin.path;
                dump("Found latex in "+latex_bin.path+"\n");
                break;
              }
            }
          }
          
          for (var i = 0; i < dirs.length; ++i) {
            var dvipng_bin = init_file(dirs[i]);
            if (dvipng_bin.exists()) {
              dvipng_bin.append("dvipng"+ext);
              if (dvipng_bin.exists()) {
                found.dvipng = dvipng_bin.path;
                dump("Found dvipng in "+dvipng_bin.path+"\n");
                break;
              }
            }
          }
          
          if (isWindows) {
            var temp_dir = Cc["@mozilla.org/file/directory_service;1"].
              getService(Ci.nsIProperties).get("TmpD", Ci.nsIFile).path;
            if (temp_dir.length > 0 && init_file(temp_dir).exists()) {
              found.temp = temp_dir;
            }
          }

          return found;
        }

      }
    };
  }
};
