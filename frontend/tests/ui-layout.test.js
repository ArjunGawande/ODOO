import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Table } from '@/components/ui';

describe('Table', () => {
  it('contains absolutely positioned screen-reader text inside its scroller', () => {
    const page = renderToStaticMarkup(createElement(Table, { caption: 'Staff members' }));
    const wrapper = /<div[^>]*role="region"[^>]*>/.exec(page)[0];
    expect(wrapper).toContain('overflow-x-auto');
    expect(wrapper).toContain('relative');
  });
});

describe('route boundaries', () => {
  // A loading.js starts streaming before the page runs. The status is then already
  // 200, so notFound() can't send a 404 and a guard can't send a real redirect.
  it('has no loading.js, so guards and notFound keep their HTTP status', () => {
    const files = readdirSync(path.resolve('frontend/src/app'), { recursive: true }).map(String);
    expect(files.filter((file) => path.basename(file) === 'loading.js')).toEqual([]);
  });

  // Without one, every browser's automatic favicon request logs a 404 in the console.
  it('has an app icon', () => {
    expect(existsSync(path.resolve('frontend/src/app/icon.svg'))).toBe(true);
  });
});
