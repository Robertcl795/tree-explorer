import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TreeExplorerComponent } from './tree-explorer.component';
import { SELECTION_MODES, TreeAdapter, TreeConfig } from '@tree-core';

describe('TreeExplorerComponent', () => {
  let component: TreeExplorerComponent;
  let fixture: ComponentFixture<TreeExplorerComponent>;
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

    fixture = TestBed.createComponent(TreeExplorerComponent);
    component = fixture.componentInstance;

    adapter = {
      getId: (source) => source.id,
      getLabel: (dataItem) => dataItem.name,
      getChildren: (dataItem) => dataItem.children,
    };

    component.adapter.set(adapter);
    component.config.set(config);
    component.data.set(data);
    fixture.detectChanges();
  });

  it('renders root rows', () => {
    const rows = fixture.nativeElement.querySelectorAll('td-tree-item');
    expect(rows.length).toBe(1);
  });

  it('selects rows on click when enabled', () => {
    const row = component.visibleRows()[0];
    component.onRowClick(new MouseEvent('click'), row);

    const selectedIds = Array.from((component as any).treeService.selectedIds());
    expect(selectedIds).toEqual(['root']);
  });

  it('applies filter query through the tree state service', () => {
    component.filterQuery.set('missing');
    fixture.detectChanges();
    expect(component.visibleRows().length).toBe(0);

    component.filterQuery.set(null);
    fixture.detectChanges();
    expect(component.visibleRows().length).toBe(1);
  });
});
