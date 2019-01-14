var tblatex = {
  on_latexit: null,
  on_undo: null,
  on_undo_all: null,
  on_insert_complex: null,
  on_open_options: null
};

(function () {
  var isWindows = ("@mozilla.org/windows-registry-key;1" in Components.classes);

  if (document.location.href != "chrome://messenger/content/messengercompose/messengercompose.xul")
    return;

  var g_undo_func = null;
  var g_image_cache = {};

  function dumpCallStack(e) {
    let frame = e ? e.stack : Components.stack;
    while (frame) {
      dump("\n"+frame);
      frame = frame.caller;
    }
  }

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
    var parentNode = node2.parentNode;
    if (node2.nextSibling)
      parentNode.insertBefore(node1, node2.nextSibling);
    else
      parentNode.appendChild(node1);
  }

  /* splits #text [ some text $\LaTeX$ some text ] into three separates text
   * nodes and returns the list of latex nodes */
  function split_text_nodes(node) {
    var latex_nodes = [];
    if (node.nodeType == node.TEXT_NODE) {
      var re = /\$\$[^\$]+\$\$|\$[^\$]+\$/g;
      var matches = node.nodeValue.match(re);
      if (matches) {
        for (var i = matches.length - 1; i >= 0; --i) (function (i) {
          var match = matches[i];
          var j = node.nodeValue.lastIndexOf(match);
          var k = j + match.length;
          insertAfter(node.ownerDocument.createTextNode(node.nodeValue.substr(k, (node.nodeValue.length-k))), node);
          var latex_node = node.ownerDocument.createTextNode(match);
          latex_nodes.push(latex_node);
          insertAfter(latex_node, node);
          node.nodeValue = node.nodeValue.substr(0, j);
        })(i);
      }
    } else if (node.childNodes && node.childNodes.length) {
      for (var i = node.childNodes.length - 1; i >= 0; --i) {
        if (i > 0 && node.childNodes[i-1].nodeType == node.childNodes[i-1].TEXT_NODE && node.childNodes[i].nodeValue) {
          node.childNodes[i-1].nodeValue += node.childNodes[i].nodeValue;
          node.childNodes[i].nodeValue = "";
          continue;
        }
        latex_nodes = latex_nodes.concat(split_text_nodes(node.childNodes[i]));
      }
    }
    return latex_nodes;
  }

  /* This *has* to be global. If image a.png is inserted, then modified, then
   * inserted again in the same mail, the OLD a.png is displayed because of some
   * cache which I haven't found a way to invalidate yet. */
  var g_suffix = 1;

  /* Returns [st, src, log] where :
   * - st is 0 if everything went ok, 1 if some error was found but the image
   *   was nonetheless generated, 2 if there was a fatal error
   * - src is the local path of the image if generated
   * - log is the log messages generated during the run
   * */
  function run_latex(latex_expr, silent) {
    var log = "";
    var st = 0;
    var temp_file;
    try {
      var debug = prefs.getBoolPref("debug");
      if (debug) {
        var env = Components.classes["@mozilla.org/process/environment;1"]
                  .getService(Components.interfaces.nsIEnvironment);
        log += "\n$PATH is "+env.get("PATH")+"\n";
        log += ("\n*** Generating LaTeX expression:\n"+latex_expr+"\n");
      }

      if (g_image_cache[latex_expr]) {
        if (debug)
          log += "Found a cached image file "+g_image_cache[latex_expr]+", returning\n";
        return [0, g_image_cache[latex_expr], log+"Image was already generated\n"];
      }

      var init_file = function(path) {
        var f = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
        try {
          f.initWithPath(path);
          return f;
        } catch (e) {
          log += "This path is malformed: "+path+".\n"+
            "Possible reasons include: you didn't setup the paths properly in the addon's options.\n";
          return {
            exists: function () { return false; }
          };
        }
      }
      var init_process = function(path) {
        var process = Components.classes["@mozilla.org/process/util;1"].createInstance(Components.interfaces.nsIProcess);
        process.init(path);
        return process;
      }

      var latex_bin = init_file(prefs.getCharPref("latex_path"));
      if (!latex_bin.exists()) {
        log += "Wrong path for latex bin. Please set the right path in the options dialog first.\n";
        return [2, "", log];
      }
      var dvips_bin = init_file(prefs.getCharPref("dvips_path"));
      if (!dvips_bin.exists()) {
        log += "Wrong path for dvips bin. Please set the right path in the options dialog first.\n";
        return [2, "", log];
      }
      var convert_bin = init_file(prefs.getCharPref("convert_path"));
      if (!convert_bin.exists()) {
        log += "Wrong path for convert bin. Please set the right path in the options dialog first.\n";
        return [2, "", log];
      }

      var temp_dir = Components.classes["@mozilla.org/file/directory_service;1"].
        getService(Components.interfaces.nsIProperties).
        get("TmpD", Components.interfaces.nsIFile).path;
      temp_file = init_file(temp_dir);
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
      var latex_args = ["-output-directory="+temp_dir, "-interaction=batchmode", temp_file.path];
      latex_process.run(true, latex_args, latex_args.length);
      if (debug)
        log += "I ran "+latex_bin.path+" "+latex_args.join(" ")+" error code "+latex_process.exitValue+"\n";
      if (latex_process.exitValue) {
        st = 1;
        log += "LaTeX process returned "+latex_process.exitValue+"\nProceeding anyway...\n";
      }

      ["log", "aux"].forEach(function (ext) {
          var file = init_file(temp_dir);
          file.append(temp_file_noext+"."+ext);
          file.remove(false);
        });

      var dvi_file = init_file(temp_dir);
      dvi_file.append(temp_file_noext+".dvi");
      if (!dvi_file.exists()) {
        log += "LaTeX did not output a .dvi file, something definitely went wrong. Aborting.\n";
        return [2, "", log];
      }

      var ps_file = init_file(temp_dir);
      ps_file.append(temp_file_noext+".ps");

      var dvips_process = init_process(dvips_bin);
      var dvips_args = ["-o", ps_file.path, "-E", dvi_file.path];
      dvips_process.run(true, dvips_args, dvips_args.length);
      dvi_file.remove(false);
      if (debug)
        log += "I ran "+dvips_bin.path+" "+dvips_args.join(" ")+"\n";
      if (dvips_process.exitValue) {
        log += "dvips failed with error code "+dvips_process.exitValue+". Aborting.\n";
        return [2, "", log];
      }

      var png_file = init_file(temp_dir);
      png_file.append(temp_file_noext+".png");

      var convert_process = init_process(convert_bin);
      var dpi = prefs.getIntPref("dpi");
      var convert_args = ["-units", "PixelsPerInch", "-density", dpi, ps_file.path, "-trim", png_file.path];
      convert_process.run(true, convert_args, convert_args.length);
      ps_file.remove(false);
      if (debug)
        log += "I ran "+convert_bin.path+" "+convert_args.join(" ")+"\n";
      if (convert_process.exitValue) {
        log += "convert failed with error code "+convert_process.exitValue+". Aborting.\n";
        log += "Possible explanations include:\n" +
          "- you're running Windows, and you didn't install Ghostscript\n" +
          "- you're running OSX, and you didn't launch Thunderbird from a Terminal\n\n";
        log += "Please see http://github.com/protz/LatexIt/wiki\n";
        return [2, "", log];
      }
      g_image_cache[latex_expr] = png_file.path;

      if (debug) {
        log += ("*** Status is "+st+"\n");
        log += ("*** Path is "+png_file.path+"\n");
      }

      // We must leave some time for the window manager to actually get rid of the
      // old terminal windows that pop up on Windows when launching latex.
      if (isWindows) {
        setTimeout(function () {
          window.focus();
        }, 500);
      }

      // Only delete the temporary file at this point, so that it's left on disk
      //  in case of error.
      temp_file.remove(false);

      return [st, png_file.path, log];
    } catch (e) {
      dump(e+"\n");
      dump(e.stack+"\n");
      log += "Severe error. Missing package?\n";
      log += "We left the .tex file there: "+temp_file.path+", try to run latex on it by yourself...\n";
      return [2, "", log];
    }
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
    div.innerHTML = "<a href=\"#\" "+
      "style=\"position: absolute; right: 4px; top: 4px; cursor: pointer !important;"+
        "text-decoration: none !important; font-weight: bold; font-family: sans-serif;"+
        "color: black !important;\">X</a>"+
      "<span style=\"font-family: sans-serif; font-weight: bold; font-size: large\">"+
      "LatexIt! run report...</span><br />";
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

  function replace(string, pattern, replacement) {
    var i = string.indexOf(pattern);
    if (i < 0)
      return;
    var l = pattern.length;
    var p1 = string.substring(0, i);
    var p2 = string.substring(i+l);
    return p1 + replacement + p2;
  }

  /* replaces each latex text node with the corresponding generated image */
  function replace_latex_nodes(nodes, silent) {
    var debug = prefs.getBoolPref("debug");
    var template = prefs.getCharPref("template");
    var write_log_func = null;
    var write_log = function(str) { if (!write_log_func) write_log_func = open_log(); return write_log_func(str); };
    var editor = GetCurrentEditor();
    if (!nodes.length && !silent)
      write_log("No LaTeX $$ expressions found\n");
    for (var i = 0; i < nodes.length; ++i) (function (i) { /* Need a real scope here and there is no let-binding available in Thunderbird 2 */
      var elt = nodes[i];
      if (!silent)
        write_log("*** Found expression "+elt.nodeValue+"\n");
      var latex_expr = replace(template, "__REPLACEME__", elt.nodeValue);
      var [st, url, log] = run_latex(latex_expr, silent);
      if (st || !silent)
        write_log(log);
      if (st == 0 || st == 1) {
        if (debug)
          write_log("--> Replacing node... ");
        var img = editor.createElementWithDefaults("img");
        var reader = new FileReader();
        var xhr = new XMLHttpRequest();

        xhr.addEventListener("load",function() {
          reader.readAsDataURL(xhr.response);
        },false);

        reader.addEventListener("load", function() {
          elt.parentNode.insertBefore(img, elt);
          elt.parentNode.removeChild(elt);

          img.alt = elt.nodeValue;
          img.style = "vertical-align: middle";
          img.src = reader.result;

          push_undo_func(function () {
            img.parentNode.insertBefore(elt, img);
            img.parentNode.removeChild(img);
          });
          if (debug)
            write_log("done\n");
        }, false);

        xhr.open('GET',"file://"+url);
        xhr.responseType = 'blob';
        xhr.overrideMimeType("image/png");
        xhr.send();
      } else {
        if (debug)
          write_log("--> Failed, not inserting\n");
      }
    })(i);
  }

  tblatex.on_latexit = function (event, silent) {
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
      replace_latex_nodes(latex_nodes, silent);
    } catch (e /*if false*/) { /*XXX do not catch errors to get full backtraces in dev cycles */
      Components.utils.reportError("TBLatex error: "+e);
      dump(e+"\n");
      dumpCallStack(e);
    }
    editor.endTransaction();
  };

  tblatex.on_undo = function (event) {
    var editor = GetCurrentEditor();
    editor.beginTransaction();
    try {
      if (g_undo_func)
        g_undo_func();
    } catch (e) {
      Components.utils.reportError("TBLatex Error (while undoing) "+e);
      dumpCallStack(e);
    }
    editor.endTransaction();
    event.stopPropagation();
  };

  tblatex.on_undo_all = function (event) {
    var editor = GetCurrentEditor();
    editor.beginTransaction();
    try {
      while (g_undo_func)
        g_undo_func();
    } catch (e) {
      Components.utils.reportError("TBLatex Error (while undoing) "+e);
      dumpCallStack(e);
    }
    editor.endTransaction();
    event.stopPropagation();
  };

  var g_complex_input = null;

  tblatex.on_insert_complex = function (event) {
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
        if (st == 0 || st == 1) {
          var img = editor.createElementWithDefaults("img");
          var reader = new FileReader();
          var xhr = new XMLHttpRequest();

          xhr.addEventListener("load",function() {
            reader.readAsDataURL(xhr.response);
          },false);

          reader.addEventListener("load", function() {
            editor.insertElementAtSelection(img, true);

            img.alt = latex_expr;
            img.title = latex_expr;
            img.style = "vertical-align: middle";
            img.src = reader.result;

            push_undo_func(function () {
              img.parentNode.removeChild(img);
            });
          }, false);

          xhr.open('GET',"file://"+url);
          xhr.responseType = 'blob';
          xhr.send();
        }
      } catch (e) {
        Components.utils.reportError("TBLatex Error (while inserting) "+e);
        dumpCallStack(e);
      }
      editor.endTransaction();
    };
    var template = g_complex_input || prefs.getCharPref("template");
    window.openDialog("chrome://tblatex/content/insert.xul", "", "chrome", f, template);
    event.stopPropagation();
  };

  tblatex.on_open_options = function (event) {
    window.openDialog("chrome://tblatex/content/options.xul", "", "");
    event.stopPropagation();
  };

  /* Is this even remotey useful ? */
  window.addEventListener("load",
    function () {
      var tb = document.getElementById("composeToolbar2");
      tb.setAttribute("defaultset", tb.getAttribute("defaultset")+",tblatex-button-1");
    }, false);
})()
