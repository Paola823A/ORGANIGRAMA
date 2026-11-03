export function editorShortcut(event, editingText = false) {
  if (editingText || event.altKey || event.repeat) return null;
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) {
    if (key === "c") return "copy";
    if (key === "v") return "paste";
  } else if (key === "delete") return "remove";
  return null;
}
