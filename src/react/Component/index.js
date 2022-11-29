/*
 * @Description:
 * @Date: 2022-11-23 22:32:10
 */
import { scheduleUpdate } from '../reconciler';

export class Component {
  constructor(props) {
    this.props = props;
  }
  setState(partialState) {
    scheduleUpdate(this, partialState);
  }
}
