import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ExplorerTreeNode,
  type ExplorerNode,
  type ExplorerTreeNodeProps
} from "./EquipmentExplorer";

const leafNode = (
  id: string,
  kind: ExplorerNode["kind"],
  label: string,
  parentId: string | null = null
): ExplorerNode => ({
  id,
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
