/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { enableIsInputPending } from './SchedulerFeatureFlags';

export let requestHostCallback;
export let cancelHostCallback;
export let requestHostTimeout;
export let cancelHostTimeout;
export let shouldYieldToHost;
export let requestPaint;
export let getCurrentTime;
export let forceFrameRate;

const hasPerformanceNow =
  typeof performance === 'object' && typeof performance.now === 'function';

if (hasPerformanceNow) {
  const localPerformance = performance;
  getCurrentTime = () => localPerformance.now();
} else {
  const localDate = Date;
  const initialTime = localDate.now();
  getCurrentTime = () => localDate.now() - initialTime;
}

if (
  // 感觉这里像是Node环境里跑的
  // If Scheduler runs in a non-DOM environment, it falls back to a naive
  // implementation using setTimeout.
  typeof window === 'undefined' ||
  // Check if MessageChannel is supported, too.
  typeof MessageChannel !== 'function'
) {
  // If this accidentally gets imported in a non-browser environment, e.g. JavaScriptCore,
  // fallback to a naive implementation.
  let _callback = null;
  let _timeoutID = null;
  const _flushCallback = function () {
    if (_callback !== null) {
      try {
        const currentTime = getCurrentTime();
        const hasRemainingTime = true;
        _callback(hasRemainingTime, currentTime);
        _callback = null;
      } catch (e) {
        setTimeout(_flushCallback, 0);
        throw e;
      }
    }
  };
  requestHostCallback = function (cb) {
    if (_callback !== null) {
      // Protect against re-entrancy.
      setTimeout(requestHostCallback, 0, cb);
    } else {
      _callback = cb;
      setTimeout(_flushCallback, 0);
    }
  };
  cancelHostCallback = function () {
    _callback = null;
  };
  requestHostTimeout = function (cb, ms) {
    _timeoutID = setTimeout(cb, ms);
  };
  cancelHostTimeout = function () {
    clearTimeout(_timeoutID);
  };
  shouldYieldToHost = function () {
    return false;
  };
  requestPaint = forceFrameRate = function () {};
} else {
  // Capture local references to native APIs, in case a polyfill overrides them.
  const setTimeout = window.setTimeout;
  const clearTimeout = window.clearTimeout;

  if (typeof console !== 'undefined') {
    // TODO: Scheduler no longer requires these methods to be polyfilled. But
    // maybe we want to continue warning if they don't exist, to preserve the
    // option to rely on it in the future?
    const requestAnimationFrame = window.requestAnimationFrame;
    const cancelAnimationFrame = window.cancelAnimationFrame;

    if (typeof requestAnimationFrame !== 'function') {
      // Using console['error'] to evade Babel and ESLint
      console['error'](
        "This browser doesn't support requestAnimationFrame. " +
          'Make sure that you load a ' +
          'polyfill in older browsers. https://reactjs.org/link/react-polyfills'
      );
    }
    if (typeof cancelAnimationFrame !== 'function') {
      // Using console['error'] to evade Babel and ESLint
      console['error'](
        "This browser doesn't support cancelAnimationFrame. " +
          'Make sure that you load a ' +
          'polyfill in older browsers. https://reactjs.org/link/react-polyfills'
      );
    }
  }

  let isMessageLoopRunning = false;
  let scheduledHostCallback = null;
  let taskTimeoutID = -1;

  // Scheduler periodically yields in case there is other work on the main
  // thread, like user events. By default, it yields multiple times per frame.
  // It does not attempt to align with frame boundaries, since most tasks don't
  // need to be frame aligned; for those that do, use requestAnimationFrame.
  let yieldInterval = 5;
  let deadline = 0;

  // TODO: Make this configurable
  // TODO: Adjust this based on priority?
  const maxYieldInterval = 300;
  let needsPaint = false;
  if (
    enableIsInputPending &&
    navigator !== undefined &&
    navigator.scheduling !== undefined &&
    navigator.scheduling.isInputPending !== undefined
  ) {
    const scheduling = navigator.scheduling;
    // 17.02的源码这里比较简单，
    shouldYieldToHost = function () {
      const currentTime = getCurrentTime();
      if (currentTime >= deadline) {
        // 简单的说就是长时间阻塞主线程的东西就给它打断了，绘制（交互）和用户输入之类的东西就给他打断了，都不是我们可以在最大延时里再看看
        if (needsPaint || scheduling.isInputPending()) {
          // There is either a pending paint or a pending input.
          return true;
        }
        // 300ms最大延时打断
        return currentTime >= maxYieldInterval;
      } else {
        // 不需要打断
        return false;
      }
    };

    requestPaint = function () {
      needsPaint = true;
    };
  } else {
    // `isInputPending` is not available. Since we have no way of knowing if
    // there's pending input, always yield at the end of the frame.
    shouldYieldToHost = function () {
      return getCurrentTime() >= deadline;
    };

    // Since we yield every frame regardless, `requestPaint` has no effect.
    requestPaint = function () {};
  }
  // 强制设置检测时间，源码没用到调试的时候可以设置,电脑越好，fps越高分片时间越短
  forceFrameRate = function (fps) {
    if (fps < 0 || fps > 125) {
      // Using console['error'] to evade Babel and ESLint
      console['error'](
        'forceFrameRate takes a positive int between 0 and 125, ' +
          'forcing frame rates higher than 125 fps is not supported'
      );
      return;
    }
    if (fps > 0) {
      yieldInterval = Math.floor(1000 / fps);
    } else {
      // reset the framerate
      yieldInterval = 5;
    }
  };

  const performWorkUntilDeadline = () => {
    // 有执行任务
    if (scheduledHostCallback !== null) {
      const currentTime = getCurrentTime();
      // 计算一帧的过期时间，然后你每次调用shouldYieldToHost就分片是否打断洛
      deadline = currentTime + yieldInterval;
      // 直接干掉把暂时不知道17.02这个是实现什么的
      // const hasTimeRemaining = true;
      try {
        // 执行c回调
        const hasMoreWork = scheduledHostCallback(
          // hasTimeRemaining,
          currentTime
        );
        // 执行完该回调后, 判断后续是否还有其他任务
        if (!hasMoreWork) {
          isMessageLoopRunning = false;
          scheduledHostCallback = null;
        } else {
          // 还有其他任务, 推进进入下一个宏任务队列中
          port.postMessage(null);
        }
      } catch (error) {
        // If a scheduler task throws, exit the current browser task so the
        // error can be observed.
        port.postMessage(null);
        throw error;
      }
    } else {
      isMessageLoopRunning = false;
    }
    // Yielding to the browser will give it a chance to paint, so we can
    // reset this.
    // 重置状态
    needsPaint = false;
  };

  const channel = new MessageChannel();
  // port2 发送
  const port = channel.port2;
  // port1 接收
  channel.port1.onmessage = performWorkUntilDeadline;
  // 在每一帧中执行任务
  requestHostCallback = function (callback) {
    // 回调注册
    scheduledHostCallback = callback;
    if (!isMessageLoopRunning) {
      isMessageLoopRunning = true;
      // 进入宏任务队列
      port.postMessage(null);
    }
  };
  // 取消回调
  cancelHostCallback = function () {
    scheduledHostCallback = null;
  };
  // 设置超时回调
  requestHostTimeout = function (callback, ms) {
    taskTimeoutID = setTimeout(() => {
      callback(getCurrentTime());
    }, ms);
  };
  // 取消超时
  cancelHostTimeout = function () {
    clearTimeout(taskTimeoutID);
    taskTimeoutID = -1;
  };
}
