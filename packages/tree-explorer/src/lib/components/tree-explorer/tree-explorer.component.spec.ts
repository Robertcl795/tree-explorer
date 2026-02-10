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

  it('navigates to pinned node and selects it', () => {
    fixture.componentRef.setInput('config', {
      ...config,
      pinned: { enabled: true, ids: ['child'] },
    });
    fixture.detectChanges();

    const pinnedItem = component.pinnedItems()[0];
    expect(pinnedItem).toBeDefined();

    component.onPinnedClick(new MouseEvent('click'), pinnedItem);

    const selectedIds = Array.from((component as any).treeService.selectedIds());
    expect(selectedIds).toEqual(['child']);
    expect((component as any).treeService.expandedIds().has('root')).toBeTrue();
  });
});
