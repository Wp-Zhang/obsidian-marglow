import { afterEach, expect, it, vi } from "vitest";
import { CommentPreview } from "../src/comment-preview";
import { annotation } from "./helpers";

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

it("opens without clicking, renders user text safely, and survives repeated motion on the same mark", () => {
  vi.useFakeTimers();
  const preview = new CommentPreview(document), item = { ...annotation(), comment: '<img src=x>\n\nSecond paragraph.' };
  preview.show(item, new DOMRect(100,100,50,20));
  vi.advanceTimersByTime(80); preview.show(item,new DOMRect(100,100,50,20)); vi.advanceTimersByTime(80);
  const panel = document.querySelector('.marglow-comment-preview')!;
  expect(panel.textContent).toContain(item.comment); expect(panel.querySelector('img')).toBeNull();
  preview.leave(); panel.dispatchEvent(new MouseEvent('pointerenter')); vi.advanceTimersByTime(200);
  expect(panel.isConnected).toBe(true);
  preview.validate([{...item,comment:'External edit'}]); expect(panel.isConnected).toBe(false); preview.dispose();
});

it("dismisses on pointer exit, outside input, Escape, and teardown without touching a comment draft", () => {
  vi.useFakeTimers(); const preview = new CommentPreview(document), item = annotation();
  const show = () => { preview.show(item,new DOMRect(100,100,50,20));vi.advanceTimersByTime(160); };
  show(); preview.leave(); vi.advanceTimersByTime(180); expect(document.querySelector('.marglow-comment-preview')).toBeNull();
  show(); document.body.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})); expect(document.querySelector('.marglow-comment-preview')).toBeNull();
  show(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); expect(document.querySelector('.marglow-comment-preview')).toBeNull();
  show(); preview.dispose(); vi.runAllTimers(); expect(document.querySelector('.marglow-comment-preview')).toBeNull();
});
