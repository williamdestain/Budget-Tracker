import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SupabaseService } from './supabase.service';

describe('SupabaseService', () => {
  it('expose un client initialisé', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(SupabaseService);
    expect(service.client).toBeTruthy();
    expect(service.client.auth).toBeTruthy();
  });
});
