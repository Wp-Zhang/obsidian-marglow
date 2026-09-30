/** Convert screen-space measurements into the overlay host's unscaled CSS space. */
export function overlayRect(rect: DOMRect, host: HTMLElement): DOMRect {
  const box = host.getBoundingClientRect();
  const scaleX = host.offsetWidth && box.width ? box.width / host.offsetWidth : 1;
  const scaleY = host.offsetHeight && box.height ? box.height / host.offsetHeight : 1;
  return new DOMRect(
    (rect.left - box.left) / scaleX - host.clientLeft + host.scrollLeft,
    (rect.top - box.top) / scaleY - host.clientTop + host.scrollTop,
    rect.width / scaleX, rect.height / scaleY,
  );
}
