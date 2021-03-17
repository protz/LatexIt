async function on_load() {
  let extraEnvPathSuggestions = [];
  let plattform = await messenger.runtime.getPlatformInfo();
  let isWindows = (plattform.os == "win");
  let isOSX = (plattform.os == "mac");
  
  if (isWindows) {
    document.getElementById("div_win32").style.display = "block";
  }
  
  if (isOSX) {
    extraEnvPathSuggestions = [
      "/usr/local/bin",
      "/usr/texbin",
      "/usr/X11/bin",
      "/usr/local/texlive/2016/bin/x86_64-darwin/"
    ];
  }  
  
  let found = await messenger.LatexIt.search_in_path(isWindows, extraEnvPathSuggestions);
  if (found.latex) {
    await messenger.LegacyPrefs.setPref("tblatex.latex_path", found.latex);
  }
  if (found.dvipng) {
    await messenger.LegacyPrefs.setPref("tblatex.dvipng_path", found.dvipng);
  }

  var latex_path = await messenger.LegacyPrefs.getPref("tblatex.latex_path");
  if (latex_path.length > 0 && messenger.LatexIt.file_exists(latex_path)) {
    document.getElementById("latex_path").appendChild(document.createTextNode(latex_path));
    document.getElementById("latex_icon").src = "accept.png";
  } else {
    document.getElementById("latex_path").innerHTML = "<span style='color: #EB887C; font-weight: bold;'>Not Found!</span>";
    document.getElementById("button_yes").setAttribute("disabled", "disabled");
  }
  var dvipng_path =  await messenger.LegacyPrefs.getPref("tblatex.dvipng_path");
  if (dvipng_path.length > 0 && messenger.LatexIt.file_exists(dvipng_path)) {
    document.getElementById("dvipng_path").appendChild(document.createTextNode(dvipng_path));
    document.getElementById("dvipng_icon").src = "accept.png";
  } else {
    document.getElementById("dvipng_path").innerHTML = "<span style='color: #EB887C; font-weight: bold;'>Not Found!</span>";
    document.getElementById("button_yes").setAttribute("disabled", "disabled");
  }

  if (window.arguments && window.arguments[0]) {
    window.arguments[0](document);
  }
}

async function on_yes() {
  await messenger.LegacyPrefs.setPref("tblatex.firstrun", 3);
  messenger.runtime.sendMessage({
    command: "closeFirstRunTab"
  })
}

async function on_no() {
  let w = await messenger.windows.getCurrent();
  messenger.runtime.sendMessage({
    command: "openOptionsDialog",
    windowId: w.id    
  })
  await on_yes();
}

window.addEventListener("load", () => {
  // Fire and forget, do not await the call.
  on_load();
  
  document.getElementById("button_no").addEventListener("click", on_no);
  document.getElementById("button_yes").addEventListener("click", on_yes);
  document.getElementById("button_autodetect").addEventListener("click", (e) => {
    document.location.reload();    
  });
});
