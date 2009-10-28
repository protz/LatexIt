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

  function run_latex() {
    return [true, "http://www.google.com/intl/en_ALL/images/logo.gif"];
  }

  /* replaces each latex text node with the corresponding generated image */
  function replace_latex_nodes(nodes) {
    let editor = GetCurrentEditor();
    for (let i = 0; i < nodes.length; ++i) {
      let elt = nodes[i];
      dump(elt.textContent+"\n");
      let [st, url] = run_latex(elt.nodeData);
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
