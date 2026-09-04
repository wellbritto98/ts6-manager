import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveAiAssistantNavItem } from '../../../frontend/src/components/layout/ai-assistant-nav.ts';

const SIDEBAR_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../frontend/src/components/layout/Sidebar.tsx',
);

describe('resolveAiAssistantNavItem', () => {
  it('does not render the item for a non-admin even when a url is set', () => {
    expect(resolveAiAssistantNavItem({
      isAdmin: false,
      meAssistantUrl: 'https://ai.example.com',
    })).toBeNull();
  });

  it('hides the item when the admin has an empty assistant url', () => {
    expect(resolveAiAssistantNavItem({
      isAdmin: true,
      viteAssistantUrl: '',
      meAssistantUrl: null,
    })).toBeNull();
    expect(resolveAiAssistantNavItem({
      isAdmin: true,
      meAssistantUrl: '   ',
    })).toBeNull();
  });

  it('opens the configured url in a new tab without an iframe', () => {
    expect(resolveAiAssistantNavItem({
      isAdmin: true,
      meAssistantUrl: 'https://ai.example.com',
    })).toEqual({
      href: 'https://ai.example.com',
      target: '_blank',
      rel: 'noopener noreferrer',
      embed: 'none',
    });
  });

  it('prefers the vite override over the runtime me url', () => {
    expect(resolveAiAssistantNavItem({
      isAdmin: true,
      viteAssistantUrl: 'https://vite.example.com',
      meAssistantUrl: 'https://me.example.com',
    })?.href).toBe('https://vite.example.com');
  });

  it('wires the helper into the sidebar as a new-tab link, never an iframe', () => {
    const sidebar = readFileSync(SIDEBAR_PATH, 'utf8');

    expect(sidebar).toContain('resolveAiAssistantNavItem');
    expect(sidebar).toContain('target={item.target}');
    expect(sidebar).toContain('rel={item.rel}');
    expect(sidebar).not.toMatch(/<iframe/i);
  });
});
