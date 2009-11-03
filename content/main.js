(function () {
  if (document.location.href != "chrome://messenger/content/messengercompose/messengercompose.xul")
    return;

  var g_undo_func = null;
  var g_image_cache = {};

  function push_undo_func(f) {
    var old_undo_func = g_undo_func;
    var g = function () {
      g_undo_func = old_undo_func;
      f();
    };
    g_undo_func = g;
  }

  var prefs = Components.classes["@mozilla.org/preferences-service;1"]
    .getService(Components.interfaces.nsIPrefService)
    .getBranch("tblatex.");

  function insertAfter(node1, node2) {
    if (node2.nextSibling)
      node2.parentNode.insertBefore(node1, node2.nextSibling);
    else
      node2.parentNode.appendChild(node1);
  }

  /* splits #text [ some text $\LaTeX$ some text ] into three separates text
   * nodes and returns the list of latex nodes */
  function split_text_nodes(node) {
    var latex_nodes = [];
    if (node.nodeType == node.TEXT_NODE) {
      var re = /\$\$[^\$]+\$\$|\$[^\$]+\$/g;
      var matches = node.nodeValue.match(re);
      if (matches) {
        for (var i = matches.length - 1; i >= 0; --i) {
          var match = matches[i];
          var j = node.nodeValue.lastIndexOf(match);
          var k = j + match.length;
          insertAfter(document.createTextNode(node.nodeValue.substr(k, (node.nodeValue.length-k))), node);
          var latex_node = document.createTextNode(match);
          latex_nodes.push(latex_node);
          insertAfter(latex_node, node);
          node.nodeValue = node.nodeValue.substr(0, j);
        }
      }
    } else if (node.childNodes && node.childNodes.length) {
      for (var i = node.childNodes.length - 1; i >= 0; --i)
        latex_nodes = latex_nodes.concat(split_text_nodes(node.childNodes[i]));
    }
    return latex_nodes;
  }

  /* This *has* to be global. If image a.png is inserted, then modified, then
   * inserted again in the same mail, the OLD a.png is displayed because of some
   * cache which I haven't found a way to invalidate yet. */
  var g_suffix = 1;

  function run_latex(latex_expr) {
    var log = "";
    if (g_image_cache[latex_expr])
      return [true, "file://"+g_image_cache[latex_expr], log+"Image was already generated\n"];

    var init_file = function(path) {
      var f = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
      f.initWithPath(path);
      return f;
    }
    var init_process = function(path) {
      var process = Components.classes["@mozilla.org/process/util;1"].createInstance(Components.interfaces.nsIProcess);
      process.init(path);
      return process;
    }

    dump("Generating LaTeX expression "+latex_expr+"\n");
    var latex_bin = init_file(prefs.getCharPref("latex_path"));
    if (!latex_bin.exists()) {
      log += "Wrong path for latex bin. Please set the right path in the options dialog first.\n";
      return [false, "", log];
    }
    var dvips_bin = init_file(prefs.getCharPref("dvips_path"));
    if (!dvips_bin.exists()) {
      log += "Wrong path for dvips bin. Please set the right path in the options dialog first.\n";
      return [false, "", log];
    }
    var convert_bin = init_file(prefs.getCharPref("convert_path"));
    if (!convert_bin.exists()) {
      log += "Wrong path for convert bin. Please set the right path in the options dialog first.\n";
      return [false, "", log];
    }

    var temp_dir = Components.classes["@mozilla.org/file/directory_service;1"].
      getService(Components.interfaces.nsIProperties).
      get("TmpD", Components.interfaces.nsIFile).path;
    var temp_file = init_file(temp_dir);
    temp_file.append("tblatex-"+g_suffix+".png");
    while (temp_file.exists()) {
      g_suffix++;
      temp_file = init_file(temp_dir);
      temp_file.append("tblatex-"+g_suffix+".png");
    }
    var temp_file_noext = "tblatex-"+g_suffix;
    temp_file = init_file(temp_dir);
    temp_file.append("tblatex-"+g_suffix+".tex");
    if (temp_file.exists()) temp_file.remove(false);

    // file is nsIFile, data is a string
    var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"].
      createInstance(Components.interfaces.nsIFileOutputStream);

    // use 0x02 | 0x10 to open file for appending.
    foStream.init(temp_file, 0x02 | 0x08 | 0x20, 0666, 0); 
    // write, create, truncate
    // In a c file operation, we have no need to set file mode with or operation,
    // directly using "r" or "w" usually.

    // if you are sure there will never ever be any non-ascii text in data you can 
    // also call foStream.writeData directly
    var converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"].
      createInstance(Components.interfaces.nsIConverterOutputStream);
    converter.init(foStream, "UTF-8", 0, 0);
    converter.writeString(latex_expr);
    converter.close(); // this closes foStream


    var latex_process = init_process(latex_bin);
    latex_process.run(true, ["-output-directory="+temp_dir, "-interaction=batchmode", temp_file.path], 3);
    temp_file.remove(false);
    if (latex_process.exitValue) {
      log += "LaTeX process returned "+latex_process.exitValue+"\nProceeding anyway...\n";
    }

    var dvi_file = init_file(temp_dir);
    dvi_file.append(temp_file_noext+".dvi");
    if (!dvi_file.exists()) {
      log += "LaTeX did not output a .dvi file, something definitely went wrong. Aborting.\n";
      return [false, "", log];
    }

    var ps_file = init_file(temp_dir);
    ps_file.append(temp_file_noext+".ps");

    var dvips_process = init_process(dvips_bin);
    dvips_process.run(true, ["-o", ps_file.path, "-E", dvi_file.path], 4);
    dvi_file.remove(false);
    if (dvips_process.exitValue) {
      log += "dvips failed with error code "+dvips_process.exitValue+". Aborting.\n";
      return [false, "", log];
    }

    var png_file = init_file(temp_dir);
    png_file.append(temp_file_noext+".png");

    var convert_process = init_process(convert_bin);
    var dpi = prefs.getIntPref("dpi");
    convert_process.run(true, ["-units", "PixelsPerInch", "-density", dpi, ps_file.path, "-trim", png_file.path], 7);
    ps_file.remove(false);
    if (convert_process.exitValue) {
      log += "convert failed with error code "+convert_process.exitValue+". Aborting.\n";
      return [false, "", log];
    }
    g_image_cache[latex_expr] = png_file.path;

    ["log", "aux"].forEach(function (ext) {
        var file = init_file(temp_dir);
        file.append(temp_file_noext+"."+ext);
        file.remove(false);
      });

    return [true, "file://"+png_file.path, log];
  }

  function open_log() {
    var want_log = prefs.getBoolPref("log");
    if (!want_log)
      return (function () {});

    var editor = document.getElementById("content-frame");
    var edocument = editor.contentDocument;
    var body = edocument.getElementsByTagName("body")[0];
    var div = edocument.createElement("div");
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
    var a = div.getElementsByTagName("a")[0];
    a.addEventListener('click', {
        handleEvent: function (event) {
          a.parentNode.parentNode.removeChild(a.parentNode);
          return false
        }
      }, false);
    var p = edocument.createElement("pre");
    p.setAttribute("style", "max-height: 500px; overflow: auto;");
    div.appendChild(p);
    var f = function (text) { var n = edocument.createTextNode(text); p.appendChild(n); };
    return f;
  }

  function close_log() {
    var editor = document.getElementById("content-frame");
    var edocument = editor.contentDocument;
    var div = edocument.getElementById("tblatex-log");
    if (div)
      div.parentNode.removeChild(div);
  }

  /* replaces each latex text node with the corresponding generated image */
  function replace_latex_nodes(nodes) {
    var template = prefs.getCharPref("template");
    var write_log = open_log();
    var editor = GetCurrentEditor();
    if (!nodes.length)
      write_log("No LaTeX $$ expressions found\n");
    for (var i = 0; i < nodes.length; ++i) {
      var elt = nodes[i];
      write_log("*** Found expression "+elt.nodeValue+"\n");
      var latex_expr = template.replace("__REPLACEME__", elt.nodeValue);
      var [st, url, log] = run_latex(latex_expr);
      write_log(log);
      if (st) {
        var img = editor.createElementWithDefaults("img");
        img.setAttribute("alt", elt.nodeValue);
        img.setAttribute("src", url);
        img.setAttribute("style", "vertical-align: middle");
        elt.parentNode.insertBefore(img, elt);
        elt.parentNode.removeChild(elt);
        push_undo_func(function () {
          editor.beginTransaction();
          img.parentNode.insertBefore(elt, img);
          img.parentNode.removeChild(img);
          editor.endTransaction();
        });
      }
    }
  }

  function on_toolbarbutton_clicked(event) {
    /* safety checks */
    if (event.button == 2) return;
    var editor_elt = document.getElementById("content-frame");
    if (editor_elt.editortype != "htmlmail") {
      alert("Cannot Latexify plain text emails. Use Options > Format to switch to HTML Mail.");
      return;
    }

    var editor = GetCurrentEditor();
    editor.beginTransaction();
    try {
      close_log();
      var body = editor_elt.contentDocument.getElementsByTagName("body")[0];
      var latex_nodes = split_text_nodes(body);
      replace_latex_nodes(latex_nodes);
    } catch (e /*if false*/) { /*XXX do not catch errors to get full backtraces in dev cycles */
      Application.console.log("TBLatex error: "+e);
    }
    editor.endTransaction();
  }

  function undo(event) {
    try {
      if (g_undo_func)
        g_undo_func();
    } catch (e) {
      Application.console.log("TBLatex Error (while undoing) "+e);
    }
    event.stopPropagation();
  }

  function undo_all(event) {
    try {
      while (g_undo_func)
        g_undo_func();
    } catch (e) {
      Application.console.log("TBLatex Error (while undoing) "+e);
    }
    event.stopPropagation();
  }

  var g_complex_input = null;

  function open_insert_dialog(event) {
    var editor = GetCurrentEditor();
    var f = function (latex_expr) {
      g_complex_input = latex_expr;
      editor.beginTransaction();
      try {
        close_log();
        var write_log = open_log();
        var [st, url, log] = run_latex(latex_expr);
        log = log || "Everything went OK.\n";
        write_log(log);
        if (st) {
          var img = editor.createElementWithDefaults("img");
          img.setAttribute("alt", latex_expr);
          img.setAttribute("src", url);
          img.setAttribute("style", "vertical-align: middle");
          editor.insertElementAtSelection(img, true);
          push_undo_func(function () {
            editor.beginTransaction();
            img.parentNode.removeChild(img);
            close_log();
            editor.endTransaction();
          });
        }
      } catch (e) {
        Application.console.log("TBLatex Error (while inserting) "+e);
      }
      editor.endTransaction();
    }
    var template = g_complex_input || prefs.getCharPref("template");
    window.openDialog("chrome://tblatex/content/insert.xul", "", "chrome", f, template);
    event.stopPropagation();
  }

  tblatex_on_toolbarbutton_clicked = on_toolbarbutton_clicked;
  window.addEventListener("load",
    function () {
      document.getElementById("tblatex-button-1").addEventListener("command", on_toolbarbutton_clicked, false);
      document.getElementById("tblatex-button-undo").addEventListener("command", undo, false);
      document.getElementById("tblatex-button-undo_all").addEventListener("command", undo_all, false);
      document.getElementById("tblatex-button-insert_complex").addEventListener("command", open_insert_dialog, false);
    }, false);
})()
