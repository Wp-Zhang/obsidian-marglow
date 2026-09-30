import { expect, it } from "vitest";
import { overlayRect } from "../src/overlay-geometry";

it("undoes pinch/CSS scaling before drawing inside a scaled page", () => {
  const host = document.createElement("div");
  Object.defineProperties(host, {
    offsetWidth: { value: 602 }, offsetHeight: { value: 802 },
    clientLeft: { value: 1 }, clientTop: { value: 1 },
    scrollLeft: { value: 0 }, scrollTop: { value: 0 },
  });
  host.getBoundingClientRect = () => new DOMRect(-150, 80, 1204, 1604);
  const local = overlayRect(new DOMRect(52, 282, 400, 40), host);
  expect([local.left, local.top, local.width, local.height]).toEqual([100, 100, 200, 20]);
});

it("retains scroll offsets and handles different scales on each axis", () => {
  const host = document.createElement("div");
  Object.defineProperties(host, {
    offsetWidth: { value: 200 }, offsetHeight: { value: 400 },
    scrollLeft: { value: 30 }, scrollTop: { value: 70 },
  });
  host.getBoundingClientRect = () => new DOMRect(10, 20, 100, 800);
  const local = overlayRect(new DOMRect(30, 100, 40, 60), host);
  expect([local.left, local.top, local.width, local.height]).toEqual([70, 110, 80, 30]);
});
