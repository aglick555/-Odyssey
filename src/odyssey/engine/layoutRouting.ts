import type { FlowEdge, FlowNode, Stage } from "../flowData";

export type RenderMode = "actual" | "robust" | "delta";

export type RoutedNode = FlowNode & {
  x: number;
  y: number;
  stageIndex: number;
  orderIndex: number;
};

export type RoutedBundle = {
  key: string;
  stagePair: string;
  stagePairIndex: number;
  centerY: number;
  desiredY: number;
  weight: number;
  actualThickness: number;
  robustThickness: number;
  deltaThickness: number;
  startThickness: number;
  endThickness: number;
  memberEdgeIds: string[];
  fromNodeIds: string[];
  toNodeIds: string[];
  uniqueFromCount: number;
  uniqueToCount: number;
  fromX: number;
  toX: number;
  entryX: number;
  exitX: number;
  joinStrength: number;
  splitStrength: number;
};

export type RoutedEdge = FlowEdge & {
  fromNode: RoutedNode;
  toNode: RoutedNode;
  actualThickness: number;
  robustThickness: number;
  deltaThickness: number;
  fromCenterY: number;
  toCenterY: number;
  pathCurve: number;
  bundleKey: string;
  bundleIndex: number;
  bundleLaneY: number;
  bundleLocalOffset: number;
  bundleWeight: number;
  bundleSlotOffset: number;
  bundleThicknessAtMode: number;
  joinStrength: number;
  splitStrength: number;
};

export type LayoutFrame = {
  width: number;
  height: number;
  paddingX: number;
  paddingY: number;
  columnGap: number;
  rowGap: number;
};

const STAGE_ORDER: Stage[] = ["source", "allocation", "activity", "outcome", "result"];
const MIN_THICKNESS = 6;
const THICKNESS_SCALE = 2.35;
const NODE_PORT_PADDING = 18;
const EDGE_GAP = 3;
const BUNDLE_GAP = 24;

const DEFAULT_FRAME: LayoutFrame = {
  width: 1520,
  height: 760,
  paddingX: 28,
  paddingY: 24,
  columnGap: 92,
  rowGap: 18,
};

type StagePairStats = {
  uniqueFrom: Set<string>;
  uniqueTo: Set<string>;
};

type BundleReservation = {
  key: string;
  stagePair: string;
  desiredY: number;
  centerY: number;
  weight: number;
  index: number;
};

type BundleBuildState = {
  reservation: BundleReservation;
  stagePairIndex: number;
  actualThickness: number;
  robustThickness: number;
  deltaThickness: number;
  memberEdgeIds: string[];
  fromNodeIds: Set<string>;
  toNodeIds: Set<string>;
  minFromX: number;
  maxToX: number;
};

function compareNodes(a: FlowNode, b: FlowNode) {
  const stageCmp = STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
  if (stageCmp !== 0) return stageCmp;
  const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  if (a.value !== b.value) return b.value - a.value;
  return a.id.localeCompare(b.id);
}

function compareEdges(a: FlowEdge, b: FlowEdge, nodeMap: Map<string, RoutedNode>, side: "out" | "in") {
  const aPeer = side === "out" ? nodeMap.get(a.to)! : nodeMap.get(a.from)!;
  const bPeer = side === "out" ? nodeMap.get(b.to)! : nodeMap.get(b.from)!;
  if (aPeer.y !== bPeer.y) return aPeer.y - bPeer.y;
  if (a.value !== b.value) return b.value - a.value;
  return a.id.localeCompare(b.id);
}

function thicknessFor(edge: FlowEdge, mode: RenderMode) {
  if (mode === "delta") {
    return Math.max(4, Math.abs(edge.scenarioDelta || 0) * THICKNESS_SCALE * 1.4);
  }
  if (mode === "robust") {
    const robustValue = Math.max(0.15, edge.value + (edge.scenarioDelta || 0));
    return Math.max(MIN_THICKNESS * 0.6, robustValue * THICKNESS_SCALE);
  }
  return Math.max(MIN_THICKNESS, edge.value * THICKNESS_SCALE);
}

function dominantLot(edge: FlowEdge) {
  return [...edge.lots].sort()[0] || edge.color;
}

function stagePairId(from: Stage, to: Stage) {
  return `${from}->${to}`;
}

function buildStagePairStats(edges: FlowEdge[], nodeMap: Map<string, RoutedNode>) {
  const stats = new Map<string, StagePairStats>();
  edges.forEach((edge) => {
    const fromNode = nodeMap.get(edge.from)!;
    const toNode = nodeMap.get(edge.to)!;
    const pair = stagePairId(fromNode.stage, toNode.stage);
    if (!stats.has(pair)) stats.set(pair, { uniqueFrom: new Set(), uniqueTo: new Set() });
    const entry = stats.get(pair)!;
    entry.uniqueFrom.add(edge.from);
    entry.uniqueTo.add(edge.to);
  });
  return stats;
}

function chooseBundleKey(edge: FlowEdge, nodeMap: Map<string, RoutedNode>, stats: Map<string, StagePairStats>) {
  const fromNode = nodeMap.get(edge.from)!;
  const toNode = nodeMap.get(edge.to)!;
  const pair = stagePairId(fromNode.stage, toNode.stage);
  const pairStats = stats.get(pair)!;

  if (pairStats.uniqueTo.size <= 3 && pairStats.uniqueFrom.size > pairStats.uniqueTo.size) {
    return `${pair}:to:${edge.to}`;
  }
  if (pairStats.uniqueFrom.size <= 3 && pairStats.uniqueTo.size > pairStats.uniqueFrom.size) {
    return `${pair}:from:${edge.from}`;
  }
  return `${pair}:lot:${dominantLot(edge)}`;
}

function reserveBundleLanes(
  edges: FlowEdge[],
  nodeMap: Map<string, RoutedNode>,
  mode: RenderMode,
  frame: LayoutFrame,
) {
  const pairStats = buildStagePairStats(edges, nodeMap);
  const bundles = new Map<string, { stagePair: string; desiredY: number; weight: number; edges: FlowEdge[] }>();

  edges.forEach((edge) => {
    const fromNode = nodeMap.get(edge.from)!;
    const toNode = nodeMap.get(edge.to)!;
    const key = chooseBundleKey(edge, nodeMap, pairStats);
    const pair = stagePairId(fromNode.stage, toNode.stage);
    const desiredY = ((fromNode.y + fromNode.h / 2) + (toNode.y + toNode.h / 2)) / 2;
    const weight = thicknessFor(edge, mode);
    if (!bundles.has(key)) {
      bundles.set(key, { stagePair: pair, desiredY: 0, weight: 0, edges: [] });
    }
    const bundle = bundles.get(key)!;
    bundle.edges.push(edge);
    bundle.desiredY += desiredY * weight;
    bundle.weight += weight;
  });

  const reservations = new Map<string, BundleReservation>();
  const byStagePair = new Map<string, Array<{ key: string; stagePair: string; desiredY: number; weight: number }>>();

  bundles.forEach((bundle, key) => {
    const desiredY = bundle.weight > 0 ? bundle.desiredY / bundle.weight : bundle.desiredY;
    const entry = { key, stagePair: bundle.stagePair, desiredY, weight: bundle.weight };
    byStagePair.set(bundle.stagePair, [...(byStagePair.get(bundle.stagePair) || []), entry]);
  });

  byStagePair.forEach((items, pair) => {
    const ordered = [...items].sort((a, b) => a.desiredY - b.desiredY || b.weight - a.weight || a.key.localeCompare(b.key));
    let previousBottom = -Infinity;
    ordered.forEach((item, index) => {
      const half = Math.max(20, item.weight * 0.18);
      const minCenter = frame.paddingY + half + 10;
      const maxCenter = frame.height - frame.paddingY - half - 10;
      const desired = Math.min(maxCenter, Math.max(minCenter, item.desiredY));
      const centerY = Math.min(maxCenter, Math.max(minCenter, Math.max(desired, previousBottom + half + BUNDLE_GAP)));
      previousBottom = centerY + half;
      reservations.set(item.key, { key: item.key, stagePair: pair, desiredY: item.desiredY, centerY, weight: item.weight, index });
    });
  });

  return { reservations, pairStats };
}

function joinOrSplitStrength(memberCount: number, totalThickness: number) {
  if (memberCount <= 1) return 0.22;
  return Math.min(0.64, 0.28 + memberCount * 0.065 + Math.min(0.16, totalThickness / 420));
}

function bundleTerminalThickness(totalThickness: number, memberCount: number) {
  if (memberCount <= 1) return totalThickness;
  return Math.max(18, Math.min(totalThickness, totalThickness * 0.46 + memberCount * 6));
}

export function buildDeterministicNodeLayout(nodes: FlowNode[], frame: Partial<LayoutFrame> = {}): RoutedNode[] {
  const fullFrame = { ...DEFAULT_FRAME, ...frame };
  const grouped = new Map<Stage, FlowNode[]>();
  for (const stage of STAGE_ORDER) grouped.set(stage, []);
  [...nodes].sort(compareNodes).forEach((node) => grouped.get(node.stage)!.push(node));

  const stageWidths = STAGE_ORDER.map((stage) => Math.max(...grouped.get(stage)!.map((n) => n.w), 160));
  const contentWidth = stageWidths.reduce((sum, value) => sum + value, 0) + fullFrame.columnGap * (STAGE_ORDER.length - 1);
  const xStart = fullFrame.paddingX + Math.max(0, (fullFrame.width - fullFrame.paddingX * 2 - contentWidth) / 2);

  const stageX = new Map<Stage, number>();
  let cursorX = xStart;
  STAGE_ORDER.forEach((stage, index) => {
    stageX.set(stage, cursorX);
    cursorX += stageWidths[index] + fullFrame.columnGap;
  });

  const routed: RoutedNode[] = [];
  STAGE_ORDER.forEach((stage, stageIndex) => {
    const stageNodes = grouped.get(stage)!;
    const totalHeight = stageNodes.reduce((sum, node) => sum + node.h, 0) + Math.max(0, stageNodes.length - 1) * fullFrame.rowGap;
    let cursorY = fullFrame.paddingY + Math.max(0, (fullFrame.height - fullFrame.paddingY * 2 - totalHeight) / 2);

    stageNodes.forEach((node, orderIndex) => {
      routed.push({
        ...node,
        x: stageX.get(stage)!,
        y: cursorY,
        stageIndex,
        orderIndex,
      });
      cursorY += node.h + fullFrame.rowGap;
    });
  });

  return routed;
}

export function buildDeterministicEdgeRouting(
  routedNodes: RoutedNode[],
  edges: FlowEdge[],
  mode: RenderMode,
  frame: Partial<LayoutFrame> = {},
): { edges: RoutedEdge[]; bundles: RoutedBundle[] } {
  const fullFrame = { ...DEFAULT_FRAME, ...frame };
  const nodeMap = new Map(routedNodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, FlowEdge[]>();
  const incoming = new Map<string, FlowEdge[]>();

  edges.forEach((edge) => {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) || []), edge]);
    incoming.set(edge.to, [...(incoming.get(edge.to) || []), edge]);
  });

  outgoing.forEach((list, key) => outgoing.set(key, [...list].sort((a, b) => compareEdges(a, b, nodeMap, "out"))));
  incoming.forEach((list, key) => incoming.set(key, [...list].sort((a, b) => compareEdges(a, b, nodeMap, "in"))));

  const stagePairStats = buildStagePairStats(edges, nodeMap);
  const stagePairOrder = Array.from(new Set(edges.map((edge) => stagePairId(nodeMap.get(edge.from)!.stage, nodeMap.get(edge.to)!.stage))));
  const { reservations: bundleReservations, pairStats } = reserveBundleLanes(edges, nodeMap, mode, fullFrame);

  const bundleStates = new Map<string, BundleBuildState>();
  edges.forEach((edge) => {
    const fromNode = nodeMap.get(edge.from)!;
    const toNode = nodeMap.get(edge.to)!;
    const bundleKey = chooseBundleKey(edge, nodeMap, stagePairStats);
    if (!bundleStates.has(bundleKey)) {
      const reservation = bundleReservations.get(bundleKey)!;
      bundleStates.set(bundleKey, {
        reservation,
        stagePairIndex: stagePairOrder.indexOf(reservation.stagePair),
        actualThickness: 0,
        robustThickness: 0,
        deltaThickness: 0,
        memberEdgeIds: [],
        fromNodeIds: new Set<string>(),
        toNodeIds: new Set<string>(),
        minFromX: fromNode.x + fromNode.w,
        maxToX: toNode.x,
      });
    }
    const state = bundleStates.get(bundleKey)!;
    state.actualThickness += thicknessFor(edge, "actual") + EDGE_GAP;
    state.robustThickness += thicknessFor(edge, "robust") + EDGE_GAP;
    state.deltaThickness += thicknessFor(edge, "delta") + EDGE_GAP;
    state.memberEdgeIds.push(edge.id);
    state.fromNodeIds.add(edge.from);
    state.toNodeIds.add(edge.to);
    state.minFromX = Math.min(state.minFromX, fromNode.x + fromNode.w);
    state.maxToX = Math.max(state.maxToX, toNode.x);
  });

  const outgoingBundleOffset = new Map<string, number>();
  const incomingBundleOffset = new Map<string, number>();
  const nodeOutOffset = new Map<string, number>();
  const nodeInOffset = new Map<string, number>();

  const routedEdges = [...edges]
    .sort((a, b) => {
      const fromA = nodeMap.get(a.from)!;
      const fromB = nodeMap.get(b.from)!;
      if (fromA.stageIndex !== fromB.stageIndex) return fromA.stageIndex - fromB.stageIndex;
      if (fromA.orderIndex !== fromB.orderIndex) return fromA.orderIndex - fromB.orderIndex;
      return compareEdges(a, b, nodeMap, "out");
    })
    .map((edge) => {
      const fromNode = nodeMap.get(edge.from)!;
      const toNode = nodeMap.get(edge.to)!;
      const actualThickness = thicknessFor(edge, "actual");
      const robustThickness = thicknessFor(edge, "robust");
      const deltaThickness = thicknessFor(edge, "delta");
      const routeThickness = thicknessFor(edge, mode);
      const bundleKey = chooseBundleKey(edge, nodeMap, stagePairStats);
      const bundle = bundleReservations.get(bundleKey)!;
      const bundleState = bundleStates.get(bundleKey)!;
      const bundleThicknessAtMode = mode === "robust" ? bundleState.robustThickness : mode === "delta" ? bundleState.deltaThickness : bundleState.actualThickness;

      const fromCurrent = nodeOutOffset.get(edge.from) || 0;
      const toCurrent = nodeInOffset.get(edge.to) || 0;
      const fromCenterY = fromNode.y + NODE_PORT_PADDING + fromCurrent + routeThickness / 2;
      const toCenterY = toNode.y + NODE_PORT_PADDING + toCurrent + routeThickness / 2;
      nodeOutOffset.set(edge.from, fromCurrent + routeThickness + EDGE_GAP);
      nodeInOffset.set(edge.to, toCurrent + routeThickness + EDGE_GAP);

      const outBundleKey = `${bundleKey}:out`;
      const inBundleKey = `${bundleKey}:in`;
      const outBundleOffset = outgoingBundleOffset.get(outBundleKey) || 0;
      const inBundleOffset = incomingBundleOffset.get(inBundleKey) || 0;
      const outDirection = fromCenterY <= bundle.centerY ? -1 : 1;
      const inDirection = toCenterY <= bundle.centerY ? -1 : 1;
      const outSlotCenter = outDirection * (outBundleOffset + routeThickness / 2);
      const inSlotCenter = inDirection * (inBundleOffset + routeThickness / 2);
      const bundleSlotOffset = (outSlotCenter + inSlotCenter) / 2;
      outgoingBundleOffset.set(outBundleKey, outBundleOffset + routeThickness + EDGE_GAP);
      incomingBundleOffset.set(inBundleKey, inBundleOffset + routeThickness + EDGE_GAP);

      const bundleLaneY = bundle.centerY;
      const stageDistance = Math.max(1, toNode.stageIndex - fromNode.stageIndex);
      const verticalBias = Math.min(0.12, Math.abs(toCenterY - fromCenterY) / 2400);
      const bundleBias = Math.min(0.09, Math.abs(bundleSlotOffset) / Math.max(120, bundleThicknessAtMode * 1.8));
      const pathCurve = 0.3 + stageDistance * 0.055 + verticalBias + bundleBias;
      const pairStat = pairStats.get(bundle.stagePair)!;
      const joinStrength = joinOrSplitStrength(pairStat.uniqueFrom.size, bundleThicknessAtMode);
      const splitStrength = joinOrSplitStrength(pairStat.uniqueTo.size, bundleThicknessAtMode);

      return {
        ...edge,
        fromNode,
        toNode,
        actualThickness,
        robustThickness,
        deltaThickness,
        fromCenterY,
        toCenterY,
        pathCurve: Math.min(0.58, pathCurve),
        bundleKey,
        bundleIndex: bundle.index,
        bundleLaneY,
        bundleLocalOffset: bundleSlotOffset,
        bundleWeight: bundle.weight,
        bundleSlotOffset,
        bundleThicknessAtMode,
        joinStrength,
        splitStrength,
      };
    });

  const routedBundles: RoutedBundle[] = Array.from(bundleStates.entries()).map(([key, state]) => {
    const uniqueFromCount = state.fromNodeIds.size;
    const uniqueToCount = state.toNodeIds.size;
    const actualThickness = Math.max(16, state.actualThickness - EDGE_GAP);
    const robustThickness = Math.max(12, state.robustThickness - EDGE_GAP);
    const deltaThickness = Math.max(10, state.deltaThickness - EDGE_GAP);
    const referenceThickness = mode === "robust" ? robustThickness : mode === "delta" ? deltaThickness : actualThickness;
    const startThickness = bundleTerminalThickness(referenceThickness, uniqueFromCount);
    const endThickness = bundleTerminalThickness(referenceThickness, uniqueToCount);
    const span = Math.max(160, state.maxToX - state.minFromX);
    const joinStrength = joinOrSplitStrength(uniqueFromCount, referenceThickness);
    const splitStrength = joinOrSplitStrength(uniqueToCount, referenceThickness);
    return {
      key,
      stagePair: state.reservation.stagePair,
      stagePairIndex: state.stagePairIndex,
      centerY: state.reservation.centerY,
      desiredY: state.reservation.desiredY,
      weight: state.reservation.weight,
      actualThickness,
      robustThickness,
      deltaThickness,
      startThickness,
      endThickness,
      memberEdgeIds: [...state.memberEdgeIds],
      fromNodeIds: [...state.fromNodeIds],
      toNodeIds: [...state.toNodeIds],
      uniqueFromCount,
      uniqueToCount,
      fromX: state.minFromX,
      toX: state.maxToX,
      entryX: state.minFromX + span * (0.12 + joinStrength * 0.12),
      exitX: state.maxToX - span * (0.12 + splitStrength * 0.12),
      joinStrength,
      splitStrength,
    };
  });

  return { edges: routedEdges, bundles: routedBundles };
}

export function buildDeterministicLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
  mode: RenderMode,
  frame: Partial<LayoutFrame> = {},
) {
  const routedNodes = buildDeterministicNodeLayout(nodes, frame);
  const { edges: routedEdges, bundles } = buildDeterministicEdgeRouting(routedNodes, edges, mode, frame);
  return { nodes: routedNodes, edges: routedEdges, bundles };
}
