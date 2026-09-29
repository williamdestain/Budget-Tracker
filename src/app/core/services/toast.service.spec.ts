import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('affiche un message puis l’efface après 3200 ms', () => {
    const toast = TestBed.inject(ToastService);

    toast.show('OK');
    expect(toast.message()).toBe('OK');

    vi.advanceTimersByTime(3199);
    expect(toast.message()).toBe('OK');

    vi.advanceTimersByTime(1);
    expect(toast.message()).toBeNull();
  });

  it('réinitialise le délai si un second message arrive avant expiration', () => {
    const toast = TestBed.inject(ToastService);

    toast.show('un');
    vi.advanceTimersByTime(2000);
    toast.show('deux');
    vi.advanceTimersByTime(2000);
    expect(toast.message()).toBe('deux');

    vi.advanceTimersByTime(1200);
    expect(toast.message()).toBeNull();
  });
});
