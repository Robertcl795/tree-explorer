import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TreeItemComponent } from './tree-item.component';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TREE_DENSITY, TreeRowViewModel } from '@tree-core';

describe('TreeItemComponent', () => {
  let component: TreeItemComponent;
  let fixture: ComponentFixture<TreeItemComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        TreeItemComponent,
        NoopAnimationsModule
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TreeItemComponent);
    component = fixture.componentInstance;
  });

  beforeEach(() => {
    const row: TreeRowViewModel<any> = {
      id: 'root',
      level: 0,
      label: 'Root',
      icon: 'folder',
      isLeaf: false,
      disabled: false,
      visible: true,
      expanded: false,
      selected: false,
      indeterminate: false,
      loading: false,
      childrenIds: ['child-1'],
      data: { id: 'root', name: 'Root' },
    };

    component.row.set(row);
    component.display.set({
      indentPx: 24,
      density: TREE_DENSITY.NORMAL,
      showIcons: true,
    });
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

});
