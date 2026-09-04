export type AiAssistantNavItem = {
  href: string;
  target: '_blank';
  rel: 'noopener noreferrer';
  embed: 'none';
};

/**
 * Decides whether the AI Assistant nav item exists and how it opens.
 * Viewers never see it. An empty URL never becomes a dead link or an iframe.
 */
export function resolveAiAssistantNavItem(input: {
  isAdmin: boolean;
  viteAssistantUrl?: string;
  meAssistantUrl?: string | null;
}): AiAssistantNavItem | null {
  const url = (input.viteAssistantUrl || input.meAssistantUrl || '').trim();
  if (!input.isAdmin || url.length === 0) {
    return null;
  }

  return {
    href: url,
    target: '_blank',
    rel: 'noopener noreferrer',
    embed: 'none',
  };
}
