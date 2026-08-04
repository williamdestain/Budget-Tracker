import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  email = '';
  password = '';
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  constructor(
    private auth: AuthService,
    private router: Router,
  ) {}

  async submit() {
    this.error.set(null);
    this.loading.set(true);
    const err = await this.auth.signIn(this.email, this.password);
    this.loading.set(false);
    if (err) {
      this.error.set('Identifiants incorrects.');
      return;
    }
    this.router.navigate(['/']);
  }
}
