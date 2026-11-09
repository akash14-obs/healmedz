import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { Api, Auth, errorText, isValidMobile, Session } from './api';
import { PhoneInput } from './phone-input';

@Component({
  selector: 'app-signin-page',
  imports: [FormsModule, RouterLink, PhoneInput],
  template: `
    <section class="panel narrow">
      <h1>{{ registering() ? 'Create your account' : 'Log in' }}</h1>
      <p class="muted">You need an account to book a test. Searching and comparing stay free without one.</p>
      @if (demo()) { <p class="notice">This is a demo, so please use made-up details.</p> }
      <form (ngSubmit)="submit()">
        @if (registering()) {
          <label>Full name <input name="name" required maxlength="100" autocomplete="name" [(ngModel)]="name" /></label>
        }
        <app-phone-input [(value)]="phone" />
        <label>Password
          <input name="password" type="password" required [autocomplete]="registering() ? 'new-password' : 'current-password'" [(ngModel)]="password" />
          @if (registering()) { <small class="muted">At least 8 characters</small> }
        </label>
        @if (error()) { <p class="notice error" role="alert">{{ error() }}</p> }
        <button class="primary" type="submit" [disabled]="busy()">{{ registering() ? 'Sign up' : 'Log in' }}</button>
      </form>
      <button class="link" type="button" (click)="toggle()">
        {{ registering() ? 'Already have an account? Log in' : 'New here? Sign up' }}
      </button>
      <p class="muted signin-labs">Run a lab? <a routerLink="/login">Go to the lab login</a></p>
    </section>
  `,
})
export class SigninPage {
  private api = inject(Api);
  private auth = inject(Auth);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  protected name = signal('');
  protected phone = signal('');
  protected password = signal('');
  protected registering = signal(false);
  protected demo = signal(false);
  protected busy = signal(false);
  protected error = signal<string | null>(null);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.registering.set(p.get('mode') === 'register');
      this.error.set(null);
    });
    this.api.meta().subscribe({ next: (m) => this.demo.set(m.demoData), error: () => {} });
  }

  protected toggle() {
    this.registering.update((r) => !r);
    this.error.set(null);
  }

  protected submit() {
    if (!isValidMobile(this.phone())) {
      this.error.set('Enter a valid 10-digit mobile number.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const call = this.registering()
      ? this.api.registerPatient(this.name(), this.phone(), this.password())
      : this.api.loginPatient(this.phone(), this.password());
    call.subscribe({
      next: (s: Session) => {
        this.auth.set(s);
        this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnUrl') || '/');
      },
      error: (e) => {
        this.error.set(errorText(e));
        this.busy.set(false);
      },
    });
  }
}
