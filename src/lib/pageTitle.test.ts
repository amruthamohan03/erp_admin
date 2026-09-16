import { describe, it, expect } from 'vitest';
import {
  buildDocumentTitle,
  fallbackTitle,
  humanizeSegment,
  normalisePath,
  resolveMenuTitle,
} from './pageTitle';
import type { MenuTreeNode } from '@/types/menu';

const node = (
  id: number,
  menu_name: string,
  url: string,
  children: MenuTreeNode[] = [],
): MenuTreeNode => ({
  id,
  menu_id: null,
  menu_order: id,
  menu_level: children.length > 0 ? 0 : 1,
  menu_name,
  url,
  text: null,
  icon: null,
  badge: null,
  display: 'Y',
  children,
});

// A slice of the real tree: a group with `#`, a list, a dashboard nested under
// the same prefix, and a master whose menu name differs from its URL.
const MENUS: MenuTreeNode[] = [
  node(1, 'Dashboard', '/dashboard'),
  node(2, 'License Management', '#', [
    node(3, 'Licenses (list)', '/licenses'),
    node(4, 'License Dashboard', '/licenses/dashboard'),
  ]),
  node(5, 'Masters', '#', [
    node(6, 'Declaration Office', '/masters/sub-offices'),
    node(7, 'Menu Management', 'menu/index'),
  ]),
];

describe('normalisePath', () => {
  it('treats menu/index and /menu as one route', () => {
    expect(normalisePath('menu/index')).toBe('/menu');
    expect(normalisePath('/menu')).toBe('/menu');
    expect(normalisePath('/menu/')).toBe('/menu');
  });

  it('gives a group row no route at all', () => {
    // '#' must never prefix-match, or every page would inherit a group's name.
    expect(normalisePath('#')).toBe('');
    expect(normalisePath(null)).toBe('');
  });
});

describe('resolveMenuTitle', () => {
  it('uses the configured menu name, not the URL', () => {
    // The whole reason this reads the menu: nothing in the path says
    // "Declaration Office".
    expect(resolveMenuTitle('/masters/sub-offices', MENUS)).toBe('Declaration Office');
  });

  it('prefers the LONGEST match', () => {
    // /licenses/dashboard sits under /licenses; the more specific row wins, or
    // the dashboard would be titled after the list.
    expect(resolveMenuTitle('/licenses/dashboard', MENUS)).toBe('License Dashboard');
    expect(resolveMenuTitle('/licenses', MENUS)).toBe('Licenses (list)');
  });

  it('gives a detail route its parent screen name', () => {
    expect(resolveMenuTitle('/licenses/42', MENUS)).toBe('Licenses (list)');
    expect(resolveMenuTitle('/licenses/new', MENUS)).toBe('Licenses (list)');
  });

  it('matches a menu stored in the menu/index form', () => {
    expect(resolveMenuTitle('/menu', MENUS)).toBe('Menu Management');
  });

  it('does not match a path that merely shares a prefix STRING', () => {
    // /licenses-archive is not under /licenses; only a full segment boundary
    // counts, or every similarly-spelled route would borrow the wrong name.
    expect(resolveMenuTitle('/licenses-archive', MENUS)).toBeNull();
  });

  it('returns null for a route no menu covers', () => {
    expect(resolveMenuTitle('/mapping/clienttobank', MENUS)).toBeNull();
    expect(resolveMenuTitle('/', MENUS)).toBeNull();
  });
});

describe('fallbackTitle', () => {
  it('humanises the last real segment', () => {
    expect(fallbackTitle('/masters/goods-types')).toBe('Goods Types');
    expect(fallbackTitle('/bank-exchange-rates')).toBe('Bank Exchange Rates');
  });

  it('drops a record segment rather than reading it as a word', () => {
    // "Licenses 42" reads as a quantity; "Payments New" as a page that is not there.
    expect(fallbackTitle('/licenses/42')).toBe('Licenses');
    expect(fallbackTitle('/payments/new')).toBe('Payments');
    expect(fallbackTitle('/imports/12/edit')).toBe('Edit');
  });

  it('has nothing to say about the root', () => {
    expect(fallbackTitle('/')).toBeNull();
  });
});

describe('buildDocumentTitle', () => {
  it('puts the PAGE first, because tabs truncate from the right', () => {
    expect(buildDocumentTitle('/licenses/dashboard', MENUS, 'ERP Admin'))
      .toBe('License Dashboard | ERP Admin');
  });

  it('falls back to the path when no menu covers the route', () => {
    expect(buildDocumentTitle('/mapping/clienttobank', MENUS, 'ERP Admin'))
      .toBe('Clienttobank | ERP Admin');
  });

  it('does not repeat the app name on the dashboard', () => {
    // Guards against "ERP Admin | ERP Admin" when a menu is named for the app.
    expect(buildDocumentTitle('/x', [node(9, 'ERP Admin', '/x')], 'ERP Admin'))
      .toBe('ERP Admin');
  });

  it('is just the app title at the root', () => {
    expect(buildDocumentTitle('/', MENUS, 'ERP Admin')).toBe('ERP Admin');
  });

  it('follows a renamed menu without a deploy', () => {
    const renamed = [node(3, 'Import Licences', '/licenses')];
    expect(buildDocumentTitle('/licenses/42', renamed, 'Malabar'))
      .toBe('Import Licences | Malabar');
  });
});
