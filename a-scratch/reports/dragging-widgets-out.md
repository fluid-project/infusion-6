# Dragging widgets out of a tldraw arena, onto another page

Status as of 2026-11-26: a working prototype. With Shift held, a widget can be dragged out of the tldraw demo
(`demo/tldraw/js/tldraw-dragout.js`). A page edited through Edit in Infusion accepts the drop, in its content and in its
source view. What remains is listed at the end.

## 1. The question

A widget can already be cut or copied out of the arena and pasted into a page being edited. The clipboard carries it
as PTF. In this, tldraw wraps each widget as the one nested part of kind "component" of its document, so the receiving
page unwraps it first, by `fluid.ptf.componentParts` (Infusion 6.7.2).

Could the same material be dragged directly from the arena onto the page? Nothing on the receiving side stands in the
way:

- An HTML5 native drag carries whatever data the drag source sets.
- Chrome passes custom types between its tabs and windows.

The difficulty is entirely in beginning the drag inside tldraw.

## 2. Which gesture

Tldraw drives all of a shape's gestures with pointer events: selecting it, moving it, resizing it. A pointer gesture
already under way can't be turned into a native drag. The native drag has to begin from a press on an element the
browser regards as draggable. So some gesture has to be set aside for it.

| Modifier | Conflicts |
|---|---|
| Alt/Option | tldraw duplicates a shape on Alt-drag. Many Linux window managers (GNOME, KDE, tiling WMs) move the whole window on Alt-drag, so the page never sees it |
| Ctrl | On macOS Ctrl-click is a right-click. tldraw toggles snapping with Ctrl while dragging. Some platforms take Ctrl-drag as the browser's own "copy" |
| Cmd/Meta | Taken by the OS on Windows and many Linux desktops. On macOS it is tldraw's command modifier, and Cmd-click opens links in new tabs |
| **Shift** | Rarely claimed by the OS or browser. In tldraw, Shift-click adds a shape to the selection or removes it, and Shift during a move locks it to one axis |

Shift costs least. The prototype splits Shift's press by whether the pointer then moves:

- **Released without moving:** the press is a Shift-click. The prototype does what tldraw would have done, adding the
  shape to the selection or removing it (`fluid.tldraw.toggleSelected`).
- **Moved:** the browser begins a native drag carrying the widget's PTF. The shape stays where it is.

The one loss is axis-locked moving of a widget. It can still be had by pressing Shift once a move is under way.

Presses which belong to the widget are left alone, as they are for tldraw (`fluid.tldraw.isInteractiveTarget`). These
include its buttons, inputs, text being edited, and elements with bound pointer handlers. A Shift-press on a button
remains a click on it.

A grip on each widget's frame, always draggable, would be a sensible addition. Users could find the feature without
knowing the shortcut.

## 3. What stopped the drag from beginning

Each of these was found by probing the demo in puppeteer's Chrome. The probe scripts are not kept in the repository.

1. **Tldraw's own handling of the press.** Tldraw takes the press, captures the pointer to its canvas
   (`setPointerCapture` on `.tl-canvas`), and drives the move itself. So a Shift-press over a widget is kept from
   tldraw. Listeners in the capture phase on `window` stop `pointerdown`, `pointermove` and `pointerup` from
   propagating. Should tldraw capture the pointer regardless, `gotpointercapture` releases it.
2. **`-webkit-user-drag: none`.** Tldraw's stylesheet gives every `.tl-shape` this value. It overrides a `draggable`
   attribute. The pressed element is given `-webkit-user-drag: element` inline while the press lasts.
3. **`user-select: none` with Shift held.** Tldraw's shapes are styled so their text can't be selected. Chrome takes a
   Shift-press on such text as extending a selection, not as beginning a drag. This is easily reproduced outside
   tldraw: with Shift held, a draggable `<div>` of text with `user-select: none` won't begin a drag, while one with
   `user-select: auto` will. This was why a press on a widget's text failed long after a press on its blank area
   worked. The pressed element is given `user-select: auto` while the press lasts. Since that only lifts the style
   from the element pressed, it is that element which is made draggable, not the shape.

Each of these overrides is removed again on release or at `dragend`. At `dragstart`:

- the widget's content (`editor.getContentFromCurrentPage`) is encoded by `contentToPTF`, as a copy would be;
- the PTF is set under `application/x-ptf`;
- the drag image is set to the widget's whole frame, held where it was pressed.

Puppeteer's drag interception (`Input.setInterceptDrags`) never reported a drag in headless Chrome, even on a plain
test page. Drags were instead detected by a `dragstart` listener, and by an in-page drop zone receiving the PTF.

## 4. The type carried

The PTF is carried under a type of its own, `application/x-ptf`, and not as `text/plain`:

- A drop onto any text field (an address bar, a chat box, a textarea) would otherwise insert a page of MIME.
- Custom types are passed only to pages. Chrome serialises them into a private clipboard format which other
  applications don't read. So other applications simply decline the drop.
- While the drag is only over a page, the page can read the type's name but not its data. That is enough to decide
  whether to accept the drop and where to show the drop caret.

Within an edited page, widgets being moved are still dragged as `text/plain` PTF, onto another widget. That is unchanged.

## 5. The receiving side

Both of these unwrap the document first, as a paste does (`fluid.blockEditor.widgetFromParts`):

- **The page's content** (`fluid-blockEditor.vue`) accepts `application/x-ptf` anywhere, as it accepts files. It shows
  the drop caret where the widget will land, and inserts the widget there as a paste would.
- **The source view** (`fluid-sourceView.vue`) shows its caret for the type. It moves the cursor to where the widget is
  dropped, and hands the PTF to the panel as a paste of it.

`extension/test/drop-scenario.js` step 2a drops a tldraw-wrapped counter onto a paragraph. The step checks that the
caret shows and that the widget lands in the source with an id of its own.

## 6. Between windows

The drag is an operating-system drag once it begins: Chrome hands it to the platform's drag and drop. So:

- **The windows need not touch.** The pointer may cross any expanse of desktop, other applications' windows, or the
  taskbar, and come back. The material is held by the platform for the life of the drag, not by either page.
- **Pausing mid-drag is fine.** Over a place which won't take it, the cursor shows "no drop" and nothing happens.
- **Releasing over something which declines it cancels the drag**, and the widget stays in the arena. With the type
  being Chrome's own, no other application will take it. One exception is likely, though untested: Finder on macOS can
  take a drag's plain text as a clipping file. Since no `text/plain` is set, that shouldn't arise.
- **Tab to tab within one window works too.** Hover over the target page's tab, and Chrome switches to it while the drag
  continues.
- **Separate Chrome profiles or browsers can't receive it.** Custom types survive only within one browser. A drop from
  Chrome into Firefox would find no `application/x-ptf`.

I haven't exercised these OS-level behaviours in a test, since headless Chrome can't drag between windows. They are what
HTML5 drag and drop provides on all three platforms. They should be confirmed by hand.

## 7. Remaining

- **Try it by hand across two windows,** on Windows and Linux at least, with a widget whose layers the page lacks. On
  drop, the extension then asks whether to write those layers to the site.
- **The shape's leftover state.** The document carries the shape's canvas position and size in the widget's view
  (`view.$component.shape`). These pass into the page's `fluid-potentia`. They are harmless but clutter the source, and
  could be stripped on the way in.
- **The grip on the frame** suggested above.
- **A test of the arena side** in a demo script. The demo runner has no Shift-drag action yet, and its success could
  only be seen through a drop zone in the page.
- **More than one shape.** At present a drag carries the one widget pressed, not the selection. Dragging a selection
  would carry several components, which a page can't yet take in one drop.
