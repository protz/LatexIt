var tblatex_on_toolbarbutton_clicked = function () {};

(function () {
  if (document.location.href != "chrome://messenger/content/messengercompose/messengercompose.xul")
    return;

  function insertAfter(node1, node2) {
    if (node2.nextSibling)
      node2.parentNode.insertBefore(node1, node2.nextSibling);
    else
      node2.parentNode.appendChild(node1);
  }
  
  function get_cwd() {
    return Components.classes["@mozilla.org/file/directory_service;1"].
      getService(Components.interfaces.nsIProperties).
      get("CurWorkD", Components.interfaces.nsIFile).path;
  }


  /* splits #text [ some text $\LaTeX$ some text ] into three separates text
   * nodes and returns the list of latex nodes */
  function split_text_nodes(node) {
    let latex_nodes = [];
    if (node.nodeType == node.TEXT_NODE) {
      let re = /\$[^\$]+\$/g;
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

  function run_latex(latex_expr) {
    dump("Generating LaTeX expression "+latex_expr+"\n");
    let latex_bin = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
    latex_bin.initWithPath("/usr/bin/latex");
    let dvips_bin = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
    dvips_bin.initWithPath("/usr/bin/dvips");
    let convert_bin = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
    convert_bin.initWithPath("/usr/bin/convert");

    let temp_dir = Components.classes["@mozilla.org/file/directory_service;1"].
      getService(Components.interfaces.nsIProperties).
      get("TmpD", Components.interfaces.nsIFile).path;
    dump("Using "+temp_dir+" as the temporary directory\n");
    let temp_file = Components.classes["@mozilla.org/file/directory_service;1"].
      getService(Components.interfaces.nsIProperties).
      get("TmpD", Components.interfaces.nsIFile);
    temp_file.append("tblatex.tex");
    temp_file.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0666);
    dump("Using "+temp_file.path+" as the temporary file\n");
    let cwd = get_cwd();
    dump("Current directory is "+cwd+"\n");
    let temp_file_noext = temp_file.leafName.substr(0, temp_file.leafName.lastIndexOf("."));

    let data =
      "\\documentclass{article}\n"+
      "\\pagestyle{empty}\n"+
      "\\begin{document}\n"+
      "\\begin{center}\n"+
      latex_expr+
      "\\end{center}\n"+
      "\\end{document}\n";

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


    let latex_process = Components.classes["@mozilla.org/process/util;1"]
      .createInstance(Components.interfaces.nsIProcess);
    latex_process.init(latex_bin);
    latex_process.run(true, [temp_file.path], 1);

    let dvi_file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
    dvi_file.initWithPath(cwd);
    dvi_file.append(temp_file_noext+".dvi");

    let dvips_process = Components.classes["@mozilla.org/process/util;1"]
      .createInstance(Components.interfaces.nsIProcess);
    dvips_process.init(dvips_bin);
    dvips_process.run(true, [dvi_file.path], 1);

    let ps_file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
    ps_file.initWithPath(cwd);
    ps_file.append(temp_file_noext+".ps");

    let png_file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
    png_file.initWithPath(cwd);
    png_file.append(temp_file_noext+".png");

    let convert_process = Components.classes["@mozilla.org/process/util;1"]
      .createInstance(Components.interfaces.nsIProcess);
    convert_process.init(convert_bin);
    convert_process.run(true, [dvi_file.path, "-trim", png_file.path], 3);

    return [true, "file://"+png_file.path];
  }

  /* replaces each latex text node with the corresponding generated image */
  function replace_latex_nodes(nodes) {
    let editor = GetCurrentEditor();
    for (let i = 0; i < nodes.length; ++i) {
      let elt = nodes[i];
      let [st, url] = run_latex(elt.nodeValue);
      if (st) {
        let img = editor.createElementWithDefaults("img");
        img.setAttribute("src", url);
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
    let body = editor_elt.contentDocument.querySelector("body");
    let latex_nodes = split_text_nodes(body);
    replace_latex_nodes(latex_nodes);
    editor.endTransaction();
  }

  tblatex_on_toolbarbutton_clicked = on_toolbarbutton_clicked;
})()
