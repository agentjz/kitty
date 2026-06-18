import type { DOMElement } from "ink";

export interface TuiAbsoluteBox {
  readonly hasMeasured: boolean;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

export function measureAbsoluteBox(node: DOMElement | null): TuiAbsoluteBox {
  if (!node?.yogaNode) {
    return {
      hasMeasured: false,
      left: 0,
      top: 0,
      width: 0,
    };
  }

  let left = 0;
  let top = 0;
  let current: DOMElement | undefined = node;
  while (current?.yogaNode) {
    const layout = current.yogaNode.getComputedLayout();
    left += layout.left;
    top += layout.top;
    current = current.parentNode;
  }

  return {
    hasMeasured: true,
    left,
    top,
    width: node.yogaNode.getComputedLayout().width,
  };
}
