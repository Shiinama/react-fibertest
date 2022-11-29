/*
 * @Description:
 * @Date: 2022-11-23 22:32:10
 */
import React from './react';
import { reconciler } from './react/reconciler/creatFiberDom';
const root = document.getElementById('root');

const jsx = (
  <div>
    <p>夜好深</p>
    <p>好寂寞</p>
    <p>都给我卷</p>
    <p>调度tm怎么写啊</p>
  </div>
);

reconciler(jsx, root);
