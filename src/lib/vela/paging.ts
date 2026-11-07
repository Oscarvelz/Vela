/*
  Tab paging (Nov 6 2026): while a finger drags the tabs or a tab slides in, the costly ambient work
  (the Firmament starfield, the cycle sky) holds still so every frame goes to the moving page. The sky
  drifts so slowly that a pause of a few hundred milliseconds is invisible.
*/
let paging = false;
const listeners = new Set<(on: boolean) => void>();

export function isPaging() {
  return paging;
}

export function setPaging(on: boolean) {
  if (paging === on) return;
  paging = on;
  if (on) document.documentElement.dataset.paging = "";
  else delete document.documentElement.dataset.paging;
  for (const listener of listeners) listener(on);
}

export function onPaging(listener: (on: boolean) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
