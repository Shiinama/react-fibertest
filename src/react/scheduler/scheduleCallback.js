/*
 * @Description:
 * @Date: 2022-11-25 01:21:19
 */
import { createTaskQueue } from '../until';
import { shouldYieldToHost, requestHostCallback } from './SchedulerHostConfig';
const taskQueue = createTaskQueue();
let isHostCallbackScheduled = false; //是否进入调度
let isPerformingWork = false; //是否正在工作
let currentTask = null;
export function scheduleCallback(callback) {
  let newTask = {
    callback
  };
  taskQueue.push(newTask);
  if (!isHostCallbackScheduled && !isPerformingWork) {
    isHostCallbackScheduled = true;
    //这里就进到SchedulerHostConfig了
    requestHostCallback(flushWork);
  }
  return newTask;
}

function flushWork(initialTime) {
  // 1. 做好全局标记, 表示现在已经进入调度阶段
  isHostCallbackScheduled = false;
  isPerformingWork = true;
  try {
    // 2. 循环消费队列
    return workLoop(initialTime);
  } finally {
    // 3. 还原全局标记
    currentTask = null;
    isPerformingWork = false;
  }
}
// 延迟队列我们可以留到后面实现
function workLoop() {
  currentTask = taskQueue.peek(); // 获取队列中的第一个任务
  while (currentTask) {
    const callback = currentTask.callback;
    console.log(shouldYieldToHost());
    if (shouldYieldToHost()) break;
    if (typeof callback === 'function') {
      const continuationCallback = callback();
      if (typeof continuationCallback === 'function') {
        console.log('日志上报错洛');
      } else {
        if (currentTask === taskQueue.peek()) {
          taskQueue.pop();
        }
      }
    }
    currentTask = taskQueue.peek();
  }
  if (currentTask !== null) {
    return true; // 如果task队列没有清空, 返回true. 等待调度中心下一次回调
  } else {
    return false; // task队列已经清空, 返回false.
  }
}
