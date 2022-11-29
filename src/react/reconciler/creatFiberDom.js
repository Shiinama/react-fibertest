/*
 * @Description:
 * @Date: 2022-11-23 22:44:29
 */
import { arrified, getRoot, getTag, createStateNode } from '../until';
import { commitAllWork } from './commit';
import { scheduleCallback } from '../scheduler';
let first = 1;
let subTask = null;
let pendingCommit = null;
// 构建最外层的fiber对象
function createOutFiber(jsx, root) {
  const task = {
    root,
    props: {
      children: jsx
    }
  };
  let outFiber;
  if (task.from === 'class_component') {
    const root = getRoot(task.instance);
    task.instance.__fiber.partialState = task.partialState;
    outFiber = {
      props: root.props,
      stateNode: root.stateNode,
      tag: 'host_root',
      effects: [],
      child: null,
      alternate: root
    };
    return outFiber;
  }
  outFiber = {
    props: task.props,
    stateNode: task.root,
    tag: 'host_root',
    effects: [],
    child: null,
    alternate: task.root.__rootFiberContainer
  };
  return outFiber;
}

function reconcileChildren(fiber, children) {
  /**
   * children 可能对象 也可能是数组
   * 将children 转换成数组
   */
  const arrifiedChildren = arrified(children);
  /**
   * 循环 children 使用的索引
   */
  let index = 0;
  /**
   * children 数组中元素的个数
   */
  let numberOfElements = arrifiedChildren.length;
  /**
   * 循环过程中的循环项 就是子节点的 virtualDOM 对象
   */
  let element = null;
  /**
   * 子级 fiber 对象
   */
  let newFiber = null;
  /**
   * 上一个兄弟 fiber 对象
   */
  let prevFiber = null;

  let alternate = null;
  if (fiber.alternate && fiber.alternate.child) {
    alternate = fiber.alternate.child;
  }
  console.log(arrifiedChildren);
  while (index < numberOfElements || alternate) {
    /**
     * 子级 virtualDOM 对象
     */
    element = arrifiedChildren[index];

    if (!element && alternate) {
      /**
       * 删除操作
       */
      alternate.effectTag = 'delete';
      fiber.effects.push(alternate);
    } else if (element && alternate) {
      /**
       * 更新
       */
      newFiber = {
        type: element.type,
        props: element.props,
        tag: getTag(element),
        effects: [],
        effectTag: 'update',
        parent: fiber,
        alternate
      };
      if (element.type === alternate.type) {
        /**
         * 类型相同
         */
        newFiber.stateNode = alternate.stateNode;
      } else {
        /**
         * 类型不同
         */
        newFiber.stateNode = createStateNode(newFiber);
      }
    } else if (element && !alternate) {
      /**
       * 初始渲染
       */
      /**
       * 子级 fiber 对象
       */
      newFiber = {
        type: element.type,
        props: element.props,
        tag: getTag(element),
        effects: [],
        effectTag: 'placement',
        parent: fiber
      };
      /**
       * 为fiber节点添加DOM对象或组件实例对象
       */
      newFiber.stateNode = createStateNode(newFiber);
      newFiber.stateNode = createStateNode(newFiber);
    }

    if (index === 0) {
      fiber.child = newFiber;
    } else if (element) {
      prevFiber.sibling = newFiber;
    }

    if (alternate && alternate.sibling) {
      alternate = alternate.sibling;
    } else {
      alternate = null;
    }

    // 更新
    prevFiber = newFiber;
    index++; //保存构建fiber节点的索引，等待事件后通过索引再次进行构建
  }
}

function workLoopSync() {
  while (subTask) {
    subTask = performUnitOfWork(subTask);
  }
  if (pendingCommit) {
    first++;
    commitAllWork(pendingCommit);
  }
}

// 构建子集的fiber对象的任务单元
function performUnitOfWork(fiber) {
  reconcileChildren(fiber, fiber.props.children);
  /**
   * 如果子级存在 返回子级
   * 将这个子级当做父级 构建这个父级下的子级
   */
  if (fiber.child) {
    return fiber.child;
  }

  /**
   * 如果存在同级 返回同级 构建同级的子级
   * 如果同级不存在 返回到父级 看父级是否有同级
   */
  let currentExecutelyFiber = fiber;
  while (currentExecutelyFiber.parent) {
    currentExecutelyFiber.parent.effects =
      currentExecutelyFiber.parent.effects.concat(
        currentExecutelyFiber.effects.concat([currentExecutelyFiber])
      );

    if (currentExecutelyFiber.sibling) {
      return currentExecutelyFiber.sibling;
    }
    currentExecutelyFiber = currentExecutelyFiber.parent;
  }
  pendingCommit = currentExecutelyFiber;
  console.log(pendingCommit);
}

// 源码地址 https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberWorkLoop.old.js#L674-L736
function ensureRootIsScheduled(fiber) {
  //这里我们可以直接走到注册调度任务,暂时我们分析的是Legacy模式，Concurrent模式实现的performConcurrentWorkOnRoot实现的可中断渲染可以以后实现
  let newCallbackNode;

  //接下来就可以直接走到调度中心去
  newCallbackNode = scheduleCallback(workLoopSync);
}

// 源码地址 https://github.com/facebook/react/blob/v17.0.2/packages/react-reconciler/src/ReactFiberWorkLoop.old.js#L517-L619
function scheduleUpdateOnFiber(fiber) {
  subTask = fiber;
  if (!first) {
    //对应暂无render上下文,暂时留着全套的变量管理工作量太大了，而且位运算和二进制确实搞不明白，等搞懂了或者有能力的大哥可以后面我们一起来讨论一下。
    // 对于初次构建来说我们直接进行`fiber构造`.
    workLoopSync();
  } else {
    //对于后续更新以及操作都选择去注册调度任务
    ensureRootIsScheduled(subTask);
  }
}
export function reconciler(jsx, root) {
  const outFiber = createOutFiber(jsx, root);
  scheduleUpdateOnFiber(outFiber);
}
