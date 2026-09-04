import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { AuthService } from '../../../core/services/auth.service';
import { Owner } from '../../../core/models/budget.models';

type Mode = 'choose' | 'create' | 'join' | 'created';

@Component({
  selector: 'app-setup-household',
  imports: [FormsModule],
  templateUrl: './setup-household.html',
  styleUrl: './setup-household.scss',
})
export class SetupHousehold {
  readonly mode = signal<Mode>('choose');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly joinCode = signal<string | null>(null); // affiché après création

  ownerLabel: Owner = 'moi';
  codeInput = '';

  constructor(
    public store: BudgetStore,
    private auth: AuthService,
    private router: Router,
  ) {}

  async create(): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    try {
      const { joinCode } = await this.store.createHousehold(this.ownerLabel);
      this.joinCode.set(joinCode);
      this.mode.set('created');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      this.loading.set(false);
    }
  }

  async join(): Promise<void> {
    this.error.set(null);
    if (!this.codeInput.trim()) return;
    this.loading.set(true);
    try {
      await this.store.joinHousehold(this.codeInput, this.ownerLabel);
      this.router.navigate(['/']);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      this.loading.set(false);
    }
  }

  continueToApp(): void {
    this.router.navigate(['/']);
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
