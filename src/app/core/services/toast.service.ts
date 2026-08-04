import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(msg: string): void {
    this.message.set(msg);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.message.set(null), 3200);
  }
}
