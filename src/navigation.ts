/** Wait for the host's virtualized content, without retaining stale DOM rectangles. */
export async function waitForLayout(root: HTMLElement, ready: () => boolean, alive: () => boolean): Promise<boolean> {
  const win = root.ownerDocument.defaultView!;
  const deadline = win.performance.now() + 3000;
  do {
    await new Promise<void>(resolve => win.requestAnimationFrame(() => resolve()));
    if (!root.isConnected || !alive()) return false;
    if (ready()) return true;
  } while (win.performance.now() < deadline);
  return false;
}
