// Import any needed modules.
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

// Load an additional JavaScript file.
Services.scriptloader.loadSubScript("chrome://tblatex/content/main.js", window, "UTF-8");
function onLoad(activatedWhileWindowOpen) {  
  WL.injectCSS("resource://tblatex-skin/overlay.css");
  WL.injectElements(`
  <keyset>
    <key id="tblatex-run" modifiers="accel shift" key="L"
      oncommand="tblatex.on_latexit(event, true);"
      />
  </keyset>
  <popup id="msgComposeContext">
    <menuseparator />
    <menuitem id="tblatex-context"
      label="LaTeX It!"
      class="menuitem-iconic"
      oncommand="tblatex.on_latexit(event, false);" />
    <menu id="tblatex-context-menu"
      label="More LaTeX It!">
      <menupopup id="tblatex-context-popup">
        <menuitem id="tblatex-context-undo"
          label="Undo"
          oncommand="tblatex.on_undo(event);" />
        <menuitem id="tblatex-context-undo_all"
          label="Undo All"
          oncommand="tblatex.on_undo_all(event);" />
        <menuseparator />
        <menuitem id="tblatex-context-insert_complex"
          label="Insert complex LaTeX"
          oncommand="tblatex.on_insert_complex(event);" />
      </menupopup>
    </menu>
    <menuseparator />
  </popup>
  <toolbarpalette id="MsgComposeToolbarPalette">
    <toolbarbutton id="tblatex-button-1"
      class="toolbarbutton-1"
      label="Latex It!"
      tooltiptext="Turn every $...$ into a LaTeX image (Ctrl/Meta-Shift-L for silent run)"
      type="menu-button"
      oncommand="tblatex.on_latexit(event, false);"
      onclick="tblatex.on_middleclick(event);"
      >
      <menupopup>
        <menuitem label="Undo" id="tblatex-button-undo"
          oncommand="tblatex.on_undo(event);"
          tooltiptext="Remove the last image and restore the original text"
          />
        <menuitem label="Undo All" id="tblatex-button-undo_all"
          oncommand="tblatex.on_undo_all(event);"
          tooltiptext="Remove all images and restore all formulae"
          />
        <menuseparator />
        <menuitem label="Insert complex LaTeX" id="tblatex-button-insert_complex"
          oncommand="tblatex.on_insert_complex(event);"
          tooltiptext="Open a dialog to insert an arbitrary chunk of LaTeX"
          />
      </menupopup>
    </toolbarbutton>
  </toolbarpalette>`);

  //on_load is an async function
  window.tblatex.on_load();
}

function onUnload(deactivatedWhileWindowOpen) {
  window.tblatex.on_unload();
}
