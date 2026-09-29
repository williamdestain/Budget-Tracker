import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

function runGuard(isLoggedIn: boolean) {
  const navigate = vi.fn();
  const waitUntilReady = vi.fn().mockResolvedValue(undefined);
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { waitUntilReady, isLoggedIn: () => isLoggedIn } },
      { provide: Router, useValue: { navigate } },
    ],
  });
  return {
    result: TestBed.runInInjectionContext(() => authGuard({} as never, {} as never)),
    navigate,
    waitUntilReady,
  };
}

describe('authGuard', () => {
  it('laisse passer un utilisateur déjà connecté après waitUntilReady', async () => {
    const { result, navigate, waitUntilReady } = runGuard(true);
    await expect(result).resolves.toBe(true);
    expect(waitUntilReady).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('redirige vers /login si la session est absente', async () => {
    const { result, navigate } = runGuard(false);
    await expect(result).resolves.toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});
