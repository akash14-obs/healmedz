import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { Api, Auth, errorText, Session } from './api';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule],
  template: `
    <section class="panel narrow">
      <h1>{{ registering() ? 'List your lab' : 'Sign in' }}</h1>
      <p class="muted">
        {{ registering() ? 'Add your services and prices, and our team will verify them before patients see them.'
                         : 'For labs and verification staff.' }}
      </p>
      <form (ngSubmit)="submit()">
        <label>Email <input name="email" type="email" required autocomplete="email" [(ngModel)]="email" /></label>
        <label>Password
          <input name="password" type="password" required [autocomplete]="registering() ? 'new-password' : 'current-password'" [(ngModel)]="password" />
          @if (registering()) { <small class="muted">At least 10 characters</small> }
        </label>
        @if (error()) { <p class="notice error" role="alert">{{ error() }}</p> }
        <button class="primary" type="submit" [disabled]="busy()">{{ registering() ? 'Create account' : 'Sign in' }}</button>
      </form>
      <button class="link" type="button" (click)="toggle()">
        {{ registering() ? 'Already registered? Sign in' : 'New lab? Create an account' }}
      </button>
    </section>
  `,
})
export class LoginPage {
  private api = inject(Api);
  private auth = inject(Auth);
  private router = inject(Router);

  protected email = '';
  protected password = '';
  protected registering = signal(false);
  protected busy = signal(false);
  protected error = signal<string | null>(null);

  constructor() {
    inject(ActivatedRoute).queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.registering.set(p.get('mode') === 'register');
      this.error.set(null);
    });
  }

  toggle() {
    this.registering.update((r) => !r);
    this.error.set(null);
  }

  submit() {
    this.busy.set(true);
    this.error.set(null);
    const call = this.registering() ? this.api.register(this.email, this.password) : this.api.login(this.email, this.password);
    call.subscribe({
      next: (s: Session) => {
        this.auth.set(s);
        this.router.navigate([s.role === 'ADMIN' ? '/admin' : '/provider']);
      },
      error: (e) => {
        this.error.set(errorText(e));
        this.busy.set(false);
      },
    });
  }
}
