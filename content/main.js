var tblatex = {
  on_latexit: null,
  on_middleclick: null,
  on_undo: null,
  on_undo_all: null,
  on_insert_complex: null,
  on_open_options: null,
  on_load:null,
  on_unload: null
};

(function () {
  var isWindows = ("@mozilla.org/windows-registry-key;1" in Components.classes);

  if (document.location.href != "chrome://messenger/content/messengercompose/messengercompose.xhtml")
    return;

  var g_undo_func = null;
  var g_image_cache = {};

  function sleep (delay) {
      return new Promise(function(resolve, reject) {
          window.setTimeout(resolve, delay);
      });
  }  

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
      var re = /\$\$[^\$]+\$\$|\$[^\$]+\$|\\\[.*?\\\]|\\\(.*?\\\)/g;
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

  /* Returns [st, src, depth, log] where :
   * - st is 0 if everything went ok, 1 if some error was found but the image
   *   was nonetheless generated, 2 if there was a fatal error
   * - src is the local path of the image if generated
   * - depth is the number of pixels from the bottom of the image to the baseline of the image
   * - log is the log messages generated during the run
   * */
  function run_latex(latex_expr, font_px, font_color) {
    var log = "";
    var st = 0;
    var temp_file;
    try {
      var deletetempfiles = !prefs.getBoolPref("keeptempfiles");
      var debug = prefs.getBoolPref("debug");
      if (debug)
        log += ("\n*** Generating LaTeX expression:\n"+latex_expr+"\n");

      if (g_image_cache[latex_expr+font_px+font_color]) {
        if (debug)
          log += "Found a cached image file "+g_image_cache[latex_expr+font_px+font_color].png+" (depth="+g_image_cache[latex_expr+font_px+font_color].depth+"), returning\n";
        return [0, g_image_cache[latex_expr+font_px+font_color].png, g_image_cache[latex_expr+font_px+font_color].depth, log+"Image was already generated\n"];
      }

      // Check if the LaTeX expression (that is, the whole file) contains the required packages.
      // At the moment, it checks for the minimum of
      // - \usepackage[active]{preview}
      // which must not be commented out.
      //
      // The 'preview' package is needed for the baseline alignment with the surrounding text
      // introduced in v0.7.x.
      //
      // If the package(s) cannot be found, an alert message window is shown, informing the user.
      var re = /^[^%]*\\usepackage\[(.*,\s*)?active(,.*)?\]{(.*,\s*)?preview(,.*)?}/m;
      var package_match = latex_expr.match(re);
      if (!package_match) {
        alert("Latex It! Error - Nothing added!\n\nThe package 'preview' cannot be found in the LaTeX file.\nThe inclusion of the LaTeX package 'preview' (with option 'active') is mandatory for the generated pictures to be aligned with the surrounding text!\n\nSolution:\n\tInsert a line with\n\t\t\\usepackage[active,displaymath,textmath]{preview}\n\tin the preamble of your LaTeX template or complex expression.");
        log += "!!! The package 'preview' cannot be found in the LaTeX file.\n";
        return [2, "", 0, log];
      }

      var init_file = function(path) {
        var f = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
        try {
          f.initWithPath(path);
          return f;
        } catch (e) {
          alert("Latex It! Error\n\nThis path is malformed:\n\t"+path+"\n\nSolution:\n\tSet the path properly in the add-on's options dialog (☰>Add-ons>Latex It!)");
          log += "!!! This path is malformed: "+path+".\n"+
            "Possible reasons include: you didn't setup the paths properly in the add-on's options.\n";
          return {
            exists: function () { return false; }
          };
        }
      }
      var init_process = function(path) {
        var process = Components.classes["@mozilla.org/process/util;1"].createInstance(Components.interfaces.nsIProcess);
        process.init(path);
        process.startHidden = true;
        return process;
      }
      var sanitize_arg = function(arg) {
        // on Windows the nsIProcess function will add quotes around all arguments with spaces for us
        if (isWindows)
          return arg;
        else if (arg.indexOf(" ") < 0)
          return arg;
        else
          return "\""+arg+"\"";
      }
      
      var latex_bin = init_file(prefs.getCharPref("latex_path"));
      if (!latex_bin.exists()) {
        alert("Latex It! Error\n\nThe 'latex' executable cannot be found.\n\nSolution:\n\tSet the right path in the add-on's options dialog (☰>Add-ons>Latex It!)");
        log += "!!! Wrong path for 'latex' executable. Please set the right path in the options dialog first.\n";
        return [2, "", 0, log];
      }
      var dvipng_bin = init_file(prefs.getCharPref("dvipng_path"));
      if (!dvipng_bin.exists()) {
        alert("Latex It! Error\n\nThe 'dvipng' executable cannot be found.\n\nSolution:\n\tSet the right path in the add-on's options dialog (☰>Add-ons>Latex It!)");
        log += "!!! Wrong path for 'dvipng' executable. Please set the right path in the options dialog first.\n";
        return [2, "", 0, log];
      }
      // Since version 0.7.1 we support the alignment of the inserted pictures
      // to the text baseline, which works as follows (see also
      // https://github.com/protz/LatexIt/issues/36):
      //   1. Have the LaTeX package preview available.
      //   2. Insert \usepackage[active,textmath]{preview} into the preamble of
      //      the LaTeX document.
      //   3. Run dvipng with the option --depth.
      //   4. Parse the output of the command for the depth value (a typical
      //      output is:
      //        This is dvipng 1.15 Copyright 2002-2015 Jan-Ake Larsson
      //        [1 depth=4]
      //   5. Return the depth value (in the above case 4) from
      //      'main.js:run_latex()' in addition to the values already returned.
      //   6. In 'content/main.js' replace all
      //      'img.style = "vertical-align: middle"' with
      //      'img.style = "vertical-align: -<depth>px"' (where <depth> is the
      //      value returned by dvipng and needs a - sign in front of it).
      // The problem lies in the step 4, because it looks like that it is not
      // possible to capture the output of an external command in Thunderbird
      // (https://stackoverflow.com/questions/10215643/how-to-execute-a-windows-command-from-firefox-addon#answer-10216452).
      // However it is possible to redirect the standard output into a temporary
      // file and parse that file: You need to call the command in an external
      // shell (or LatexIt! must call a special script doing the redirection,
      // which should also be avoided, because it requires installing this
      // script file).
      // Here we get the shell binary and the command line option to call an
      // external program.
      if (isWindows) {
        var env = Components.classes["@mozilla.org/process/environment;1"]
                  .getService(Components.interfaces.nsIEnvironment);
        var shell_bin = init_file(env.get("COMSPEC"));
        var shell_option = "/C";
        var temp_dir = prefs.getCharPref("windows_temp_path");
      } else {
        var shell_bin = init_file("/bin/sh");
        var shell_option = "-c";
        var temp_dir = Components.classes["@mozilla.org/file/directory_service;1"].
          getService(Components.interfaces.nsIProperties).
          get("TmpD", Components.interfaces.nsIFile).path;
      }

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
      // This adds quotes around all arguments that contains spaces but only on Unix (on Windows the nsIProcess function will add quotes around all arguments with spaces for us)
      latex_args = latex_args.map(sanitize_arg);
      latex_process.run(true, latex_args, latex_args.length);
      if (debug)
        log += "I ran "+sanitize_arg(latex_bin.path)+" "+latex_args.join(" ")+" error code "+latex_process.exitValue+"\n";
      if (latex_process.exitValue) {
        st = 1;
        log += "LaTeX process returned "+latex_process.exitValue+"\nProceeding anyway...\n";
      }

      ["log", "aux"].forEach(function (ext) {
          var file = init_file(temp_dir);
          file.append(temp_file_noext+"."+ext);
          if (deletetempfiles) file.remove(false);
        });

      var dvi_file = init_file(temp_dir);
      dvi_file.append(temp_file_noext+".dvi");
      if (!dvi_file.exists()) {
        // alert("Latex It! Error\n\nLaTeX did not output a .dvi file.\n\nSolution:\n\tWe left the .tex file there:\n\t\t"+temp_file.path+"\n\tTry to run 'latex' on it by yourself...");
        log += "!!! LaTeX did not output a .dvi file, something definitely went wrong. Aborting.\n";
        return [2, "", 0, log];
      }

      var png_file = init_file(temp_dir);
      png_file.append(temp_file_noext+".png");
      var depth_file = init_file(temp_dir);
      depth_file.append(temp_file_noext+"-depth.txt");

      // Output resolution to fit font size (see 'man dvipng', option -D) for LaTeX default font height 10 pt
      //
      //   -D num
      //       Set the output resolution, both horizontal and vertical, to num dpi
      //       (dots per inch).
      //
      //       One may want to adjust this to fit a certain text font size (e.g.,
      //       on a web page), and for a text font height of font_px pixels (in
      //       Mozilla) the correct formula is
      //
      //               <dpi> = <font_px> * 72.27 / 10 [px * TeXpt/in / TeXpt]
      //
      //       The last division by ten is due to the standard font height 10pt in
      //       your document, if you use 12pt, divide by 12. Unfortunately, some
      //       proprietary browsers have font height in pt (points), not pixels.
      //       You have to rescale that to pixels, using the screen resolution
      //       (default is usually 96 dpi) which means the formula is
      //
      //               <font_px> = <font_pt> * 96 / 72 [pt * px/in / (pt/in)]
      //
      //      On some high-res screens, the value is instead 120 dpi. Good luck!
      //
      // Looks like Thunderbird is one of the "proprietary browsers", at least if I assumed that
      // the font size returned is in points (and not pixels) I get the right size with a screen
      // resolution of 96.
      //
      //  -z 0-9
      //      Set the PNG compression level to num. The default compression level
      //      is 1, which selects maximum speed at the price of slightly larger
      //      
      //      PNGs. The include file png.h says "Currently, valid values range
      //      from 0 - 9, corresponding directly to the zlib compression levels
      //      0 - 9 (0 - no compression, 9 - "maximal" compression). Note that tests
      //      have shown that zlib compression levels 3-6 usually perform as well as
      //      level 9 for PNG images, and do considerably fewer calculations. In the
      //      future, these values may not correspond directly to the zlib compression
      //      levels."
      //
      // As a compromise we use level 3.
      //
      //  -bg color_spec
      //      Choose background color for the images. This option will be ignored
      //      if there is a background color \special in the DVI. The color spec
      //      should be in TeX color \special syntax, e.g., 'rgb 1.0 0.0 0.0'.
      //      You can also specify 'Transparent' or 'transparent' which will give
      //      you a transparent background with the normal background as a
      //      fallback color. A capitalized 'Transparent' will give a full-alpha
      //      transparency, while an all-lowercase 'transparent' will give a
      //      simple fully transparent background with non-transparent
      //      antialiased pixels. The latter would be suitable for viewers who
      //      cannot cope with a true alpha channel.  GIF images do not support
      //      full alpha transparency, so in case of GIF output, both variants
      //      will use the latter behaviour.
      //
      // We simply assume, that all modern mail viewers can handle a true alpha channel,
      // hence we use "Transparent".
      if (prefs.getBoolPref("autodpi") && font_px) {
        var font_size = parseFloat(font_px);
        if (debug)
          log += "*** Surrounding text has font size of "+font_px+"\n";
      } else {
        var font_size = prefs.getIntPref("font_px");
        if (debug)
          log += "*** Using font size "+font_size+"px set in preferences\n";
      }
      var dpi = font_size * 72.27 / 10;
      if (debug)
        log += "*** Calculated resolution is "+dpi+" dpi\n";

      var shell_process = init_process(shell_bin);
      var dvipng_args = [dvipng_bin.path, "--depth", "-T", "tight", "-z", "3", "-bg", "Transparent", "-D", dpi.toString(), "-fg", font_color, "-o", png_file.path, dvi_file.path, ">", depth_file.path];
      // This adds quotes around all arguments that contains spaces but only on Unix (on Windows the nsIProcess function will add quotes around all arguments with spaces for us)
      dvipng_args = dvipng_args.map(sanitize_arg);
      if (isWindows) {
        // The additional echo commands are needed on Windows in order to remove the unwanded backslaches and quotes added by the nsIProcess function ( shell_process.run )
        var prefix_args = ["echo ", "\"", "&"];
        var suffix_args = ["&", "echo", "\""];
        var process_args = [shell_option].concat(prefix_args, dvipng_args, suffix_args);
      } else {
        var process_args = [shell_option, dvipng_args.join(" ")];
      }
      shell_process.run(true, process_args, process_args.length);
      if (deletetempfiles) dvi_file.remove(false);
      if (debug)
        log += "I ran "+shell_bin.path+" -c '"+dvipng_args.join(" ")+"'\n";
      if (shell_process.exitValue) {
        // alert("Latex It! Error\n\nWhen converting the .dvi to a .png bitmap, 'dvipng' failed (Error code: "+shell_process.exitValue+")\n\nSolution:\n\tWe left the .dvi file there:\n\t\t"+temp_file.path+"\n\tTry to run 'dvipng --depth' on it by yourself...");
        log += "!!! dvipng failed with error code "+shell_process.exitValue+". Aborting.\n";
        return [2, "", 0, log];
      }

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

      // Read the depth (distance between base of image and baseline) from the depth file
      if (!depth_file.exists()) {
        log += "dvipng did not output a depth file. Continuing without alignment.\n";
        g_image_cache[latex_expr+font_px+font_color] = {png: png_file.path, depth: 0};
        return [st, png_file.path, 0, log];
      }

      // https://developer.mozilla.org/en-US/docs/Archive/Add-ons/Code_snippets/File_I_O#Line_by_line
      // Open an input stream from file
      var istream = Components.classes["@mozilla.org/network/file-input-stream;1"].
                    createInstance(Components.interfaces.nsIFileInputStream);
      istream.init(depth_file, 0x01, 0444, 0);
      istream.QueryInterface(Components.interfaces.nsILineInputStream);

      // Read line by line and look for the depth information, which is contained in a line such as
      //    [1 depth=4]
      var re = /^\[[0-9] +depth=([0-9]+)\] *$/;
      var line = {}, hasmore;
      var depth = 0;
      do {
        hasmore = istream.readLine(line);
        var linematch = line.value.match(re);
        if (linematch) {
          // Matching line found, get depth information and exit loop
          depth = linematch[1];
          if (debug)
            log += ("*** Depth is "+depth+"\n");
          break;
        }
      } while(hasmore);

      // Close input stream
      istream.close();
      
      if (deletetempfiles) depth_file.remove(false);

      // Only delete the temporary file at this point, so that it's left on disk
      //  in case of error.
      if (deletetempfiles) temp_file.remove(false);

      g_image_cache[latex_expr+font_px+font_color] = {png: png_file.path, depth: depth};
      return [st, png_file.path, depth, log];
    } catch (e) {
      // alert("Latex It! Error\n\nSevere error. Missing package?\n\nSolution:\n\tWe left the .tex file there:\n\t\t"+temp_file.path+"\n\tTry to run 'latex' and 'dvipng --depth' on it by yourself...");
      dump(e+"\n");
      dump(e.stack+"\n");
      log += "!!! Severe error. Missing package?\n";
      log += "We left the .tex file there: "+temp_file.path+", try to run 'latex' and 'dvipng --depth' on it by yourself...\n";
      return [2, "", 0, log];
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

  function replace_marker(string, replacement) {
    var marker = "__REPLACE_ME__";
    var oldmarker = "__REPLACEME__";
    var len = marker.length;
    var log = "";
    var i = string.indexOf(marker);
    if (i < 0) {
      // Look for old marker
      i = string.indexOf(oldmarker);
      if (i < 0) {
        log += "\n!!! Could not find the placeholder '" + marker + "' in your template.\n";
        log += "This would be the place, where your LaTeX expression is inserted.\n";
        log += "Please edit your template and add this placeholder.\n";
        return [, log];
      } else {
        len = oldmarker.length;
      }
    }
    var p1 = string.substring(0, i);
    var p2 = string.substring(i+len);
    return [p1 + replacement + p2, log];
  }

  /* replaces each latex text node with the corresponding generated image */
  function replace_latex_nodes(nodes, silent) {
    var debug = prefs.getBoolPref("debug");
    var template = prefs.getCharPref("template");
    var write_log_func = null;
    var write_log = function(str) { if (!write_log_func) write_log_func = open_log(); return write_log_func(str); };
    var editor = GetCurrentEditor();
    if (!nodes.length && !silent)
      write_log("No unconverted LaTeX $$ expression was found\n");
    for (var i = 0; i < nodes.length; ++i) (function (i) { /* Need a real scope here and there is no let-binding available in Thunderbird 2 */
      var elt = nodes[i];
      if (!silent)
        write_log("*** Found expression "+elt.nodeValue+"\n");
      var [latex_expr, log] = replace_marker(template, elt.nodeValue);
      if (log)
        write_log(log);
      // Font size in pixels
      var font_px = window.getComputedStyle(elt.parentElement, null).getPropertyValue('font-size');
      // Font color in "rgb(x,y,z)" => "RGB x y z"
      var font_color = window.getComputedStyle(elt.parentElement, null).getPropertyValue('color').replace(/([\(,\)])/g, " ").replace("rgb", "RGB");
      var [st, url, depth, log] = run_latex(latex_expr, font_px, font_color);
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
          img.style = "vertical-align: -" + depth + "px";
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
      alert("Latex It! Error\n\nCannot Latexify plain text emails.\n\nSolution:\n\tStart again by opening the message composer window in HTML mode, this can be achieved by holding the 'Shift' key while pressing the button.");
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

  tblatex.on_middleclick = function(event) {
    // Return on all but the middle button
    if (event.button != 1) return;

    if (event.shiftKey) {
      // Undo all
      undo_all();
    } else {
      // Undo
      undo();
    }
    event.stopPropagation();
  };

  tblatex.on_undo = function (event) {
    undo();
    event.stopPropagation();
  };

  function undo() {
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
  }

  tblatex.on_undo_all = function (event) {
    undo_all();
    event.stopPropagation();
  };

  function undo_all() {
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
  };

  var g_complex_input = null;

  tblatex.on_insert_complex = function (event) {
    var editor = GetCurrentEditor();
    var f = function (latex_expr, autodpi, font_size) {
      var debug = prefs.getBoolPref("debug");
      g_complex_input = latex_expr;
      editor.beginTransaction();
      try {
        close_log();
        var write_log = open_log();
        if (autodpi) {
          // Font size at cursor position
          var elt = editor.selection.anchorNode.parentElement;
          var font_px = window.getComputedStyle(elt).getPropertyValue('font-size');
        } else {
          var font_px = font_size+"px";
        }
        // Font color in "rgb(x,y,z)" => "RGB x y z"
        var font_color = window.getComputedStyle(elt).getPropertyValue('color').replace(/([\(,\)])/g, " ").replace("rgb", "RGB");
        var [st, url, depth, log] = run_latex(latex_expr, font_px, font_color);
        log = log || "Everything went OK.\n";
        write_log(log);
        if (st == 0 || st == 1) {
          if (debug)
            write_log("--> Inserting at cursor position... ");
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
            img.style = "vertical-align: -" + depth + "px";
            img.src = reader.result;

            push_undo_func(function () {
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
      } catch (e) {
        Components.utils.reportError("TBLatex Error (while inserting) "+e);
        dumpCallStack(e);
      }
      editor.endTransaction();
    };
    var template = g_complex_input || prefs.getCharPref("template");
    var selection = editor.selection.toString();
    window.openDialog("chrome://tblatex/content/insert.xhtml", "", "chrome, resizable=yes", f, template, selection);
    event.stopPropagation();
  };

  tblatex.on_open_options = function (event) {
    window.openDialog("chrome://tblatex/content/options.xhtml", "", "");
    event.stopPropagation();
  };

  function check_log_report () {
    // code from close_log();
    var editor = document.getElementById("content-frame");
    var edocument = editor.contentDocument;
    var div = edocument.getElementById("tblatex-log");
    if (div) {
      var retVals = {action: -1};
      window.openDialog("chrome://tblatex/content/sendalert.xhtml", "", "chrome,modal,dialog,centerscreen", retVals);
      switch (retVals.action) {
        case 0:
          div.parentNode.removeChild(div);
          return true;
        case 1:
          return true;
        default:
          return false;
      }
    } else {
      return true;
    }
  }


  /* Is this even remotey useful ? */
  /* Yes, because we can disable the toolbar button and menu items for plain text messages! */
  tblatex.on_load = async function () {
    // Override original send functions (this follows the approach from the "Check and Send" add-on
    tblatex.SendMessage_orig = SendMessage;
    SendMessage = function() {
      if (check_log_report())
          tblatex.SendMessage_orig.apply(this, arguments);
    }

    // Ctrl-Enter
    tblatex.SendMessageWithCheck_orig = SendMessageWithCheck;
    SendMessageWithCheck = function() {
      if (check_log_report())
          tblatex.SendMessageWithCheck_orig.apply(this, arguments);
    }

    tblatex.SendMessageLater_orig = SendMessageLater;
    SendMessageLater = function() {
      if (check_log_report())
          tblatex.SendMessageLater_orig.apply(this, arguments);
    }

    var tb = document.getElementById("composeToolbar2");
    tb.setAttribute("defaultset", tb.getAttribute("defaultset")+",tblatex-button-1");

    // wait for editortype being available (max 20 x 20ms)
    for (let i=0; i < 20; i++) {
      let editor_elt = document.getElementById("content-frame");
      if (editor_elt.editortype) {
       break;
      }
      await sleep(20);
    }

    // Disable the button and menu for non-html composer windows
    let editor_elt = document.getElementById("content-frame");
    if (editor_elt.editortype != "htmlmail") {
      var btn = document.getElementById("tblatex-button-1");
      if (btn) {
          btn.tooltipText = "Start a message in HTML format (by holding the 'Shift' key) to be able to turn every $...$ into a LaTeX image"
          btn.disabled = true;
      }
      for (var id of ["tblatex-context", "tblatex-context-menu"]) {
        var menu = document.getElementById(id);
        if (menu)
          menu.disabled = true;
      }
    }
  }

  tblatex.on_unload = function() {
    // Revert Patch
    SendMessage = tblatex.SendMessage_orig;
    SendMessageWithCheck = tblatex.SendMessageWithCheck_orig;
    SendMessageLater = tblatex.SendMessageLater_orig;

    // Remove all cached images on closing the composer window
    if (!prefs.getBoolPref("keeptempfiles")) {
      for (var key in g_image_cache) {
        var f = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
        try {
          f.initWithPath(g_image_cache[key]);
          f.remove(false);
          delete g_image_cache[key];
        } catch (e) { }
      }
    }
  }
})()
