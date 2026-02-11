import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TreeExplorerComponent } from './tree-explorer.component';
import { SELECTION_MODES, TreeAdapter, TreeConfig } from '@tree-core';

describe('TreeExplorerComponent', () => {
  let component: TreeExplorerComponent<any, any>;
  let fixture: ComponentFixture<TreeExplorerComponent<any, any>>;
  let adapter: TreeAdapter<{ id: string; name: string; children?: any[] }>;

  const data = [
    {
      id: 'root',
      name: 'Root',
      children: [{ id: 'child', name: 'Child' }],
    },
  ];

  const config: Partial<TreeConfig<any>> = {
    selection: { mode: SELECTION_MODES.SINGLE },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TreeExplorerComponent, NoopAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(TreeExplorerComponent<any, any>);
    component = fixture.componentInstance;

    adapter = {
      getId: (source) => source.id,
      getLabel: (dataItem) => dataItem.name,
      getChildren: (dataItem) => dataItem.children,
    };

    fixture.componentRef.setInput('adapter', adapter);
    fixture.componentRef.setInput('config', config);
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
  });

  it('renders root rows', () => {
    expect(component.visibleRows().length).toBe(1);
  });

  it('selects rows on click when enabled', () => {
    const row = component.visibleRows()[0];
    component.onRowClick(new MouseEvent('click'), row);

    const selectedIds = Array.from((component as any).treeService.selectedIds());
    expect(selectedIds).toEqual(['root']);
  });

  it('applies filter query through the tree state service', () => {
    fixture.componentRef.setInput('filterQuery', 'missing');
    fixture.detectChanges();
    expect(component.visibleRows().length).toBe(0);

    fixture.componentRef.setInput('filterQuery', null);
    fixture.detectChanges();
    expect(component.visibleRows().length).toBe(1);
  });

  it('shows pin action in context menu when pinned is enabled', () => {
    fixture.componentRef.setInput('config', {
      ...config,
      pinned: { enabled: true },
    });
    fixture.detectChanges();

    const row = component.visibleRows()[0];
    const node = (component as any).treeService.getNode(row.id);
    component.contextRow.set(row);
    component.contextNode.set(node);
    component.contextTarget.set('node');
    component.contextEvent.set(new MouseEvent('contextmenu'));

    const actionIds = component.getContextActions().map((action) => action.id);
    expect(actionIds).toContain('__tree_pin__');
  });

  it('pins a row through the context menu action handler', () => {
    fixture.componentRef.setInput('config', {
      ...config,
      pinned: { enabled: true },
    });
    fixture.detectChanges();

    const row = component.visibleRows()[0];
    const node = (component as any).treeService.getNode(row.id);
    component.contextRow.set(row);
    component.contextNode.set(node);
    component.contextTarget.set('node');
    component.contextEvent.set(new MouseEvent('contextmenu'));

    const pinAction = component
      .getContextActions()
      .find((action) => action.id === '__tree_pin__');

    expect(pinAction).toBeDefined();
    component.onContextAction(pinAction!);
    expect(component.pinnedItems().some((item) => item.entry.nodeId === 'root')).toBeTrue();
  });

  it('navigates to pinned node and selects it', async () => {
    fixture.componentRef.setInput('config', {
      ...config,
      pinned: { enabled: true, ids: ['child'] },
    });
    fixture.detectChanges();

    const pinnedItem = component.pinnedItems()[0];
    expect(pinnedItem).toBeDefined();

    component.onPinnedClick(new MouseEvent('click'), pinnedItem);
    await Promise.resolve();

    const selectedIds = Array.from((component as any).treeService.selectedIds());
    expect(selectedIds).toEqual(['child']);
    expect((component as any).treeService.expandedIds().has('root')).toBeTrue();
  });

  it('resolves missing pinned target through async adapter path loading', async () => {
    const lazyAdapter: TreeAdapter<any, any> = {
      getId: (source) => source.id,
      getLabel: (dataItem) => dataItem.name,
      hasChildren: (dataItem) => !!dataItem.hasChildren,
      resolvePathToNode: () => ({
        targetId: 'child',
        steps: [
          { nodeId: 'root', parentId: null },
          { nodeId: 'child', parentId: 'root' },
        ],
      }),
      loadChildren: async (node) => {
        if (node.id === 'root') {
          return [{ id: 'child', name: 'Child', hasChildren: false }];
        }
        return [];
      },
    };

    fixture.componentRef.setInput('adapter', lazyAdapter);
    fixture.componentRef.setInput('config', {
      ...config,
      pinned: {
        enabled: true,
        entries: [{ entryId: 'pin-child', nodeId: 'child', order: 0 }],
      },
    });
    fixture.componentRef.setInput('data', [
      { id: 'root', name: 'Root', hasChildren: true },
    ]);
    fixture.detectChanges();

    const pinnedItem = component.pinnedItems()[0];
    expect(pinnedItem?.missing).toBeTrue();

    component.onPinnedClick(new MouseEvent('click'), pinnedItem);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(component.visibleRows().some((row) => row.id === 'child')).toBeTrue();
    const selectedIds = Array.from((component as any).treeService.selectedIds());
    expect(selectedIds).toEqual(['child']);
  });

  it('emits loadError when pinned navigation path load fails', async () => {
    const emitSpy = spyOn(component.loadError, 'emit');
    const lazyAdapter: TreeAdapter<any, any> = {
      getId: (source) => source.id,
      getLabel: (dataItem) => dataItem.name,
      hasChildren: (dataItem) => !!dataItem.hasChildren,
      resolvePathToNode: () => ({
        targetId: 'child',
        steps: [
          { nodeId: 'root', parentId: null },
          { nodeId: 'child', parentId: 'root' },
        ],
      }),
      loadChildren: async () => {
        throw new Error('boom');
      },
    };

    fixture.componentRef.setInput('adapter', lazyAdapter);
    fixture.componentRef.setInput('config', {
      ...config,
      pinned: {
        enabled: true,
        entries: [{ entryId: 'pin-child', nodeId: 'child', order: 0 }],
      },
    });
    fixture.componentRef.setInput('data', [
      { id: 'root', name: 'Root', hasChildren: true },
    ]);
    fixture.detectChanges();

    const pinnedItem = component.pinnedItems()[0];
    component.onPinnedClick(new MouseEvent('click'), pinnedItem);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(emitSpy).toHaveBeenCalled();
    const selectedIds = Array.from((component as any).treeService.selectedIds());
    expect(selectedIds).toEqual([]);
  });
});
