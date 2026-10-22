import { jest } from "@jest/globals";
import { debounce } from "../web/ui.js";

test("debounce cancel drops a pending call", () => {
  jest.useFakeTimers();
  const fn = jest.fn();
  const scheduled = debounce(fn, 100);
  scheduled("value");
  expect(scheduled.pending()).toBe(true);
  scheduled.cancel();
  expect(scheduled.pending()).toBe(false);
  jest.advanceTimersByTime(250);
  expect(fn).not.toHaveBeenCalled();
  jest.useRealTimers();
});

test("debounce still calls the latest invocation", () => {
  jest.useFakeTimers();
  const fn = jest.fn();
  const scheduled = debounce(fn, 100);
  scheduled("first");
  scheduled("second");
  jest.advanceTimersByTime(150);
  expect(fn).toHaveBeenCalledTimes(1);
  expect(fn).toHaveBeenCalledWith("second");
  expect(scheduled.pending()).toBe(false);
  jest.useRealTimers();
});
