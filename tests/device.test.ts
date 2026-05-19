import { test } from 'node:test';
import assert from 'node:assert/strict';

type WindowGlobals = {
  navigator?: Partial<Navigator>;
};

function withWebEnv(setup: WindowGlobals, fn: () => void) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  if (setup.navigator) {
    Object.defineProperty(globalThis, 'navigator', {
      value: setup.navigator,
      writable: true,
      configurable: true,
    });
  } else {
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  }
  try {
    fn();
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'navigator', originalDescriptor);
    } else {
      delete (globalThis as { navigator?: Navigator }).navigator;
    }
  }
}

async function loadHelper() {
  const mod = await import('../lib/device-web.ts');
  return mod.isIPadFromNavigator;
}

test('iPad-UA → true', async () => {
  const isIPad = await loadHelper();
  withWebEnv(
    {
      navigator: {
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        platform: 'iPad',
        maxTouchPoints: 5,
      },
    },
    () => {
      assert.equal(isIPad(), true);
    },
  );
});

test('iPadOS Safari masquerading as MacIntel + touch → true', async () => {
  const isIPad = await loadHelper();
  withWebEnv(
    {
      navigator: {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      },
    },
    () => {
      assert.equal(isIPad(), true);
    },
  );
});

test('Regular Mac Safari (no touch) → false', async () => {
  const isIPad = await loadHelper();
  withWebEnv(
    {
      navigator: {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      },
    },
    () => {
      assert.equal(isIPad(), false);
    },
  );
});

test('iPhone → false', async () => {
  const isIPad = await loadHelper();
  withWebEnv(
    {
      navigator: {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1',
        platform: 'iPhone',
        maxTouchPoints: 5,
      },
    },
    () => {
      assert.equal(isIPad(), false);
    },
  );
});

test('Windows Chrome → false', async () => {
  const isIPad = await loadHelper();
  withWebEnv(
    {
      navigator: {
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        platform: 'Win32',
        maxTouchPoints: 0,
      },
    },
    () => {
      assert.equal(isIPad(), false);
    },
  );
});

test('Missing navigator → false', async () => {
  const isIPad = await loadHelper();
  withWebEnv({}, () => {
    assert.equal(isIPad(), false);
  });
});
