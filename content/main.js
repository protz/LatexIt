var tblatex_on_toolbarbutton_clicked = function () {};

(function () {
  if (document.location.href != "chrome://messenger/content/messengercompose/messengercompose.xul")
    return;

  Application.console.log("TBLatex initialized");

  let prefs = Components.classes["@mozilla.org/preferences-service;1"]
    .getService(Components.interfaces.nsIPrefService)
    .getBranch("tblatex.");

  function insertAfter(node1, node2) {
    if (node2.nextSibling)
      node2.parentNode.insertBefore(node1, node2.nextSibling);
    else
      node2.parentNode.appendChild(node1);
  }
  
  /*function get_cwd() {
    return Components.classes["@mozilla.org/file/directory_service;1"].
      getService(Components.interfaces.nsIProperties).
      get("CurWorkD", Components.interfaces.nsIFile).path;
  }*/


  /* splits #text [ some text $\LaTeX$ some text ] into three separates text
   * nodes and returns the list of latex nodes */
  function split_text_nodes(node) {
    let latex_nodes = [];
    if (node.nodeType == node.TEXT_NODE) {
      let re = /\$\$[^\$]+\$\$|\$[^\$]+\$/g;
      let matches = node.nodeValue.match(re);
      if (matches) {
        for (let i = matches.length - 1; i >= 0; --i) {
          let match = matches[i];
          let j = node.nodeValue.lastIndexOf(match);
          let k = j + match.length;
          insertAfter(document.createTextNode(node.nodeValue.substr(k, (node.nodeValue.length-k))), node);
          let latex_node = document.createTextNode(match);
          latex_nodes.push(latex_node);
          insertAfter(latex_node, node);
          node.nodeValue = node.nodeValue.substr(0, j);
        }
      }
    } else if (node.childNodes && node.childNodes.length) {
      for (let i = node.childNodes.length - 1; i >= 0; --i)
        latex_nodes = latex_nodes.concat(split_text_nodes(node.childNodes[i]));
    }
    return latex_nodes;
  }

  /* This *has* to be global. If image a.png is inserted, then modified, then
   * inserted in another mail, the OLD a.png is displayed because of some cache
   * which I haven't found a way to invalidate yet. */
  let g_suffix = 1;

  function run_latex(latex_expr) {
    let log = "*** Found expression "+latex_expr+"\n";
    let init_file = function(path) {
      let f = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
      f.initWithPath(path);
      return f;
    }

    dump("Generating LaTeX expression "+latex_expr+"\n");
    let latex_bin = init_file(prefs.getCharPref("latex_path"));
    if (!latex_bin.exists()) {
      log += "Wrong path for latex bin. Please set the right path in the options dialog first.\n";
      return [false, "", log];
    }
    let dvips_bin = init_file(prefs.getCharPref("dvips_path"));
    if (!dvips_bin.exists()) {
      log += "Wrong path for dvips bin. Please set the right path in the options dialog first.\n";
      return [false, "", log];
    }
    let convert_bin = init_file(prefs.getCharPref("convert_path"));
    if (!convert_bin.exists()) {
      log += "Wrong path for convert bin. Please set the right path in the options dialog first.\n";
      return [false, "", log];
    }

    let temp_dir = Components.classes["@mozilla.org/file/directory_service;1"].
      getService(Components.interfaces.nsIProperties).
      get("TmpD", Components.interfaces.nsIFile).path;
    let temp_file = init_file(temp_dir);
    temp_file.append("tblatex-"+g_suffix+".png");
    while (temp_file.exists()) {
      g_suffix++;
      temp_file = init_file(temp_dir);
      temp_file.append("tblatex-"+g_suffix+".png");
    }
    let temp_file_noext = "tblatex-"+g_suffix;
    temp_file = init_file(temp_dir);
    temp_file.append("tblatex-"+g_suffix+".tex");
    if (temp_file.exists()) temp_file.remove(false);

    let data = prefs.getCharPref("template").replace("__REPLACEME__", latex_expr);

    // file is nsIFile, data is a string
    let foStream = Components.classes["@mozilla.org/network/file-output-stream;1"].
      createInstance(Components.interfaces.nsIFileOutputStream);

    // use 0x02 | 0x10 to open file for appending.
    foStream.init(temp_file, 0x02 | 0x08 | 0x20, 0666, 0); 
    // write, create, truncate
    // In a c file operation, we have no need to set file mode with or operation,
    // directly using "r" or "w" usually.

    // if you are sure there will never ever be any non-ascii text in data you can 
    // also call foStream.writeData directly
    let converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"].
      createInstance(Components.interfaces.nsIConverterOutputStream);
    converter.init(foStream, "UTF-8", 0, 0);
    converter.writeString(data);
    converter.close(); // this closes foStream


    let latex_process = Components.classes["@mozilla.org/process/util;1"].createInstance(Components.interfaces.nsIProcess);
    latex_process.init(latex_bin);
    latex_process.run(true, ["-output-directory="+temp_dir, "-interaction=batchmode", temp_file.path], 3);
    temp_file.remove(false);
    if (latex_process.exitValue) {
      log += "LaTeX process returned "+latex_process.exitValue+"\nProceeding anyway...\n";
    }

    let dvi_file = init_file(temp_dir);
    dvi_file.append(temp_file_noext+".dvi");
    if (!dvi_file.exists()) {
      log += "LaTeX did not output a .dvi file, something definitely went wrong. Aborting.\n";
      return [false, "", log];
    }

    let ps_file = init_file(temp_dir);
    ps_file.append(temp_file_noext+".ps");

    let dvips_process = Components.classes["@mozilla.org/process/util;1"].createInstance(Components.interfaces.nsIProcess);
    dvips_process.init(dvips_bin);
    dvips_process.run(true, ["-o", ps_file.path, "-E", dvi_file.path], 4);
    dvi_file.remove(false);
    if (dvips_process.exitValue) {
      log += "dvips failed with error code "+dvips_process.exitValue+". Aborting.\n";
      return [false, "", log];
    }

    let png_file = init_file(temp_dir);
    png_file.append(temp_file_noext+".png");

    let convert_process = Components.classes["@mozilla.org/process/util;1"].createInstance(Components.interfaces.nsIProcess);
    let dpi = prefs.getIntPref("dpi");
    convert_process.init(convert_bin);
    convert_process.run(true, ["-units", "PixelsPerInch", "-density", dpi, ps_file.path, "-trim", png_file.path], 7);
    ps_file.remove(false);
    if (convert_process.exitValue) {
      log += "convert failed with error code "+convert_process.exitValue+". Aborting.\n";
      return [false, "", log];
    }

    ["log", "aux"].forEach(function (ext) {
        let file = init_file(temp_dir);
        file.append(temp_file_noext+"."+ext);
        file.remove(false);
      });

    Application.console.log(png_file.path);
    return [true, "file://"+png_file.path, log];
  }

  function open_log() {
    let want_log = prefs.getBoolPref("log");
    if (!want_log)
      return (function () {});

    let editor = document.getElementById("content-frame");
    let edocument = editor.contentDocument;
    let body = edocument.querySelector("body");
    let div = edocument.createElement("div");
    if (body.firstChild)
      body.insertBefore(div, body.firstChild);
    else
      body.appendChild(div);
    div.setAttribute("id", "tblatex-log");
    div.setAttribute("style", "border: 1px solid #333; position: relative; width: 500px;"+
        "-moz-border-radius: 5px; -moz-box-shadow: 2px 2px 6px #888; margin: 1em; padding: .5em;");
    div.innerHTML = "<a href=\"http://www.xulforum.org/go_code\" "+
      "style=\"position: absolute; right: 4px; top: 4px; cursor: pointer !important;"+
        "text-decoration: none !important; font-weight: bold; font-family: sans-serif;"+
        "color: black !important;\">X</a>"+
      "<span style=\"font-family: sans-serif; font-weight: bold; font-size: large\">"+
      "TBLaTeX run report...</span><br />";
    let a = div.querySelector("a");
    a.addEventListener('click', {
        handleEvent: function (event) {
          a.parentNode.parentNode.removeChild(a.parentNode);
          return false
        }
      }, false);
    let p = edocument.createElement("pre");
    p.setAttribute("style", "max-height: 500px; overflow: auto;");
    div.appendChild(p);
    let f = function (text) { let n = edocument.createTextNode(text); p.appendChild(n); };
    return f;
  }

  function close_log() {
    let editor = document.getElementById("content-frame");
    let edocument = editor.contentDocument;
    let div = edocument.getElementById("tblatex-log");
    if (div)
      div.parentNode.removeChild(div);
  }

  /* replaces each latex text node with the corresponding generated image */
  function replace_latex_nodes(nodes) {
    let write_log = open_log();
    let editor = GetCurrentEditor();
    if (!nodes.length)
      write_log("No LaTeX $$ expressions found\n");
    for (let i = 0; i < nodes.length; ++i) {
      let elt = nodes[i];
      let [st, url, log] = run_latex(elt.nodeValue);
      Application.console.log(url);
      write_log(log);
      if (st) {
        let img = editor.createElementWithDefaults("img");
        img.setAttribute("alt", elt.nodeValue);
        img.setAttribute("src", url);
        img.setAttribute("style", "vertical-align: middle");
        elt.parentNode.insertBefore(img, elt);
        elt.parentNode.removeChild(elt);
      }
    }
  }

  function on_toolbarbutton_clicked(event) {
    /* safety checks */
    if (event.button == 2) return;
    let editor_elt = document.getElementById("content-frame");
    if (editor_elt.editortype != "htmlmail") {
      alert("Cannot Latexify plain text emails. Use Options > Format to switch to HTML Mail.");
      return;
    }

    let editor = GetCurrentEditor();
    editor.beginTransaction();
    try {
      close_log();
      let body = editor_elt.contentDocument.querySelector("body");
      let latex_nodes = split_text_nodes(body);
      replace_latex_nodes(latex_nodes);
    } catch (e /*if false*/) { /*XXX do not catch errors to get full backtraces in dev cycles */
      Application.console.log("TBLatex error: "+e);
    }
    editor.endTransaction();
  }

  tblatex_on_toolbarbutton_clicked = on_toolbarbutton_clicked;
})()
