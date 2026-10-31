// Test yardımcıları: jest-dom eşleyicileri ve otomatik temizlik (yalnızca ui testleri içe aktarır).
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* yok say */
  }
  location.hash = '';
});
