/*
 * @Description:
 * @Date: 2022-11-23 22:32:10
 */
const createTaskQueue = () => {
  const taskQueue = [];
  return {
    /**
     * 向任务队列中添加任务
     */
    push: item => {
      taskQueue.push(item);
    },
    /**
     * 从任务队列中获取任务
     */
    pop: () => taskQueue.shift(),
    /**
     * 队首
     */
    peek: () => {
      const first = taskQueue[0];
      return first === undefined ? null : first;
    },
    /**
     * 判断任务队列中是否还有任务
     */
    isEmpty: () => taskQueue.length === 0
  };
};

export default createTaskQueue;
