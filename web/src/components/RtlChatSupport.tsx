import { useEffect } from 'react';

const DIRECTIONAL_TEXT_SELECTOR = [
  '.chat-wrapper .copilotKitMessage',
  '.chat-wrapper .copilotKitInput > textarea',
].join(', ');

const HEBREW_TEXT_RE = /[\u0590-\u05ff]/;

function getElementText(element: HTMLElement): string {
  if (element instanceof HTMLTextAreaElement) {
    return element.value;
  }

  return element.textContent ?? '';
}

function applyElementDirection(element: HTMLElement): void {
  element.setAttribute('dir', 'auto');

  const text = getElementText(element);
  if (!text.trim()) {
    element.removeAttribute('data-text-direction');
    return;
  }

  element.setAttribute(
    'data-text-direction',
    HEBREW_TEXT_RE.test(text) ? 'rtl' : 'ltr',
  );
}

function applyAutomaticDirection(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(DIRECTIONAL_TEXT_SELECTOR).forEach((element) => {
    applyElementDirection(element);
  });
}

export function RtlChatSupport(): null {
  useEffect(() => {
    applyAutomaticDirection();

    const observer = new MutationObserver(() => {
      applyAutomaticDirection();
    });

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    const handleInput = (event: Event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.matches(DIRECTIONAL_TEXT_SELECTOR)
      ) {
        applyElementDirection(target);
      }
    };

    document.addEventListener('input', handleInput, true);

    return () => {
      document.removeEventListener('input', handleInput, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
