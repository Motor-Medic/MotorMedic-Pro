import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildExplorerTree,
  ExplorerTreeNode,
  reduceExplorerSelection,
  type ExplorerNode,
  type ExplorerTreeNodeProps
} from "./EquipmentExplorer";
import { SITE_PLANT_ID, type EquipmentStore } from "../data/equipmentDb";

const leafNode = (
  id: string,
  kind: ExplorerNode["kind"],
  label: string,
  parentId: string | null = null
): ExplorerNode => ({
  id,
  entityId: id,
  kind,
  label,
  path: label,
  parentId,
  children: []
});

const tree: ExplorerNode = {
  ...leafNode("plant-root", "plant", "Main Site"),
  children: [
    {
      ...leafNode("flat-asset", "asset", "P-101 — Feed Pump", "plant-root"),
      children: [
        {
          ...leafNode("asset-comp", "component", "DE Bearing", "flat-asset"),
          children: [
            leafNode("point-de", "point", "DE Horizontal", "asset-comp")
          ]
        }
      ]
    }
  ]
};

const baseProps: Omit<ExplorerTreeNodeProps, "node" | "depth"> = {
  expanded: {
    "plant-root": true,
    "flat-asset": true,
    "asset-comp": true
  },
  selectedNodeId: null,
  onToggle: () => undefined,
  onSelect: () => undefined,
  onEdit: () => undefined,
  onAddChild: () => undefined,
  onDelete: () => undefined
};

const openingTags = (html: string) =>
  [...html.matchAll(/<div\b[^>]*>/g)].map((match) => match[0]);

const rowAtDepth = (html: string, depth: number) =>
  openingTags(html).find(
    (tag) =>
      tag.includes('data-tree-row="true"') &&
      tag.includes(`data-depth="${depth}"`)
  );

const selectedNodeIds = (html: string) =>
  openingTags(html)
    .filter(
      (tag) =>
        tag.includes('data-tree-row="true"') &&
        tag.includes('data-selected="true"')
    )
    .map((tag) => tag.match(/data-node-id="([^"]*)"/)?.[1] ?? "");

describe("ExplorerTreeNode progressive indent", () => {
  it("steps padding-left by exactly 20px per depth (0, 1, 3)", () => {
    const html = renderToStaticMarkup(
      <ExplorerTreeNode {...baseProps} node={tree} depth={0} />
    );

    expect(rowAtDepth(html, 0)).toMatch(/padding-left:\s*0px/);
    expect(rowAtDepth(html, 1)).toMatch(/padding-left:\s*20px/);
    expect(rowAtDepth(html, 3)).toMatch(/padding-left:\s*60px/);
    expect(openingTags(html).filter((tag) => tag.includes('data-tree-row="true"'))).toHaveLength(4);
  });

  it("renders expanders only on nodes with children", () => {
    const html = renderToStaticMarkup(
      <ExplorerTreeNode {...baseProps} node={tree} depth={0} />
    );

    expect(html.match(/data-tree-expander="true"/g) ?? []).toHaveLength(3);
    expect(html.match(/aria-expanded="(true|false)"/g) ?? []).toHaveLength(3);
    expect(rowAtDepth(html, 3)).toContain('data-has-children="false"');
  });

  it("renders no boxed expander for a leaf node", () => {
    const html = renderToStaticMarkup(
      <ExplorerTreeNode
        {...baseProps}
        node={leafNode("point-leaf", "point", "NDE Horizontal")}
        depth={3}
      />
    );

    expect(html).not.toContain("data-tree-expander");
    expect(rowAtDepth(html, 3)).toMatch(/padding-left:\s*60px/);
  });
});

describe("ExplorerTreeNode exclusive sticky selection", () => {
  it("selecting two nodes in sequence highlights only the second", () => {
    let selectedNodeId = reduceExplorerSelection("plant-root", {
      type: "select",
      nodeId: "flat-asset"
    });
    selectedNodeId = reduceExplorerSelection(selectedNodeId, {
      type: "select",
      nodeId: "asset-comp"
    });

    const html = renderToStaticMarkup(
      <ExplorerTreeNode
        {...baseProps}
        node={tree}
        depth={0}
        selectedNodeId={selectedNodeId}
      />
    );

    expect(selectedNodeIds(html)).toEqual(["asset-comp"]);
  });

  it("clicking outside the tree leaves the selection unchanged", () => {
    let selectedNodeId = reduceExplorerSelection("plant-root", {
      type: "select",
      nodeId: "asset-comp"
    });
    selectedNodeId = reduceExplorerSelection(selectedNodeId, {
      type: "outside-click"
    });

    expect(selectedNodeId).toBe("asset-comp");

    const html = renderToStaticMarkup(
      <ExplorerTreeNode
        {...baseProps}
        node={tree}
        depth={0}
        selectedNodeId={selectedNodeId}
      />
    );

    expect(selectedNodeIds(html)).toEqual(["asset-comp"]);
  });

  it("a simulated create highlights only the newly created node", () => {
    const createdTree: ExplorerNode = {
      ...tree,
      children: [
        ...tree.children,
        leafNode("new-asset", "asset", "NEW-01 — Created Asset", "plant-root")
      ]
    };

    let selectedNodeId = reduceExplorerSelection("plant-root", {
      type: "select",
      nodeId: "flat-asset"
    });
    selectedNodeId = reduceExplorerSelection(selectedNodeId, {
      type: "create",
      nodeId: "new-asset"
    });

    const html = renderToStaticMarkup(
      <ExplorerTreeNode
        {...baseProps}
        node={createdTree}
        depth={0}
        selectedNodeId={selectedNodeId}
      />
    );

    expect(selectedNodeIds(html)).toEqual(["new-asset"]);
  });

  it("namespaces colliding server entity ids so only one row highlights", () => {
    const store = {
      plants: [{ id: SITE_PLANT_ID, name: "Main Site" }],
      units: [{ id: "1", name: "Unit A", plantId: SITE_PLANT_ID }],
      routes: [
        {
          id: "1",
          name: "Route A",
          plantId: SITE_PLANT_ID,
          unitId: "1",
          assets: [
            {
              id: "1",
              tag: "A-1",
              name: "Asset A",
              components: [
                {
                  id: "1",
                  name: "Component A",
                  collectionPoints: [{ id: "1", name: "Point A" }]
                }
              ]
            }
          ]
        }
      ]
    } as unknown as EquipmentStore;

    const built = buildExplorerTree(store, "Main Site");
    const allNodes: ExplorerNode[] = [];
    const walk = (nodes: ExplorerNode[]) => {
      for (const node of nodes) {
        allNodes.push(node);
        walk(node.children);
      }
    };
    walk(built);

    expect(new Set(allNodes.map((node) => node.id)).size).toBe(allNodes.length);

    const route = allNodes.find((node) => node.kind === "route");
    expect(route).toBeDefined();
    expect(route!.id).not.toBe(route!.entityId);

    const html = renderToStaticMarkup(
      <ExplorerTreeNode
        {...baseProps}
        expanded={{ [SITE_PLANT_ID]: true }}
        node={built[0]}
        depth={0}
        selectedNodeId={route!.id}
      />
    );

    expect(selectedNodeIds(html)).toEqual([route!.id]);
  });
});
