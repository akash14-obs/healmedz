import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { Api, Auth } from './api';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    @if (demo()) {
      <div class="demo-bar">Demo only. Every lab and price shown here is invented.</div>
    }
    <header class="site-header">
      <div class="header-row">
        <a routerLink="/" class="brand" aria-label="HealMedz home" (click)="menuOpen.set(false)">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="9" fill="#0e3b36" />
            <path d="M13 7h6v6h6v6h-6v6h-6v-6H7v-6h6z" fill="#fff" />
            <circle cx="25" cy="7" r="3.5" fill="#f4a62a" />
          </svg>
          Heal<span>Medz</span>
        </a>
        <button class="menu-toggle" type="button" aria-controls="site-nav" [attr.aria-expanded]="menuOpen()" (click)="menuOpen.update(toggle)">
          <span class="sr-only">Menu</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="menuOpen() ? 'M6 6l12 12M18 6 6 18' : 'M4 7h16M4 12h16M4 17h16'" /></svg>
        </button>
        <div class="header-menu" id="site-nav" [class.open]="menuOpen()" (click)="closeOnLink($event)">
          <nav class="main-nav" aria-label="Main">
            @for (l of links; track l.path) {
              <a [routerLink]="l.path" routerLinkActive="current">{{ l.label }}</a>
            }
          </nav>
          <div class="header-actions">
            @if (auth.session(); as s) {
              <a [routerLink]="auth.home()">{{ s.role === 'ADMIN' ? 'Verification queue' : 'My lab' }}</a>
              <button class="link" type="button" (click)="signOut()">Sign out</button>
            } @else {
              <a routerLink="/login" [queryParams]="{ mode: 'register' }">For Providers</a>
              <a routerLink="/login">Login</a>
              <a class="button primary" routerLink="/login" [queryParams]="{ mode: 'register' }">Sign Up</a>
            }
          </div>
        </div>
      </div>
    </header>
    <main class="site-main"><router-outlet /></main>
    <footer class="site-footer">
      <div class="footer-row">
        <p><strong>HealMedz</strong> helps you compare healthcare options before you spend.</p>
        <p>Information only, not medical advice. Prices and services can change, so confirm them with the provider before you visit.</p>
      </div>
    </footer>
  `,
})
export class App {
  protected auth = inject(Auth);
  private router = inject(Router);
  protected demo = signal(false);
  protected menuOpen = signal(false);
  protected toggle = (open: boolean) => !open;

  protected links = [
    { path: '/diagnostics', label: 'Diagnostics' },
    { path: '/hospitals', label: 'Hospitals' },
    { path: '/treatments', label: 'Treatments' },
    { path: '/insurance', label: 'Insurance' },
    { path: '/government-schemes', label: 'Government Schemes' },
    { path: '/patient-rights', label: 'Patient Rights' },
  ];

  constructor() {
    inject(Api).meta().subscribe({ next: (m) => this.demo.set(m.demoData), error: () => {} });
  }

  protected closeOnLink(event: Event) {
    if ((event.target as HTMLElement).closest('a')) this.menuOpen.set(false);
  }

  signOut() {
    this.auth.clear();
    this.menuOpen.set(false);
    this.router.navigate(['/']);
  }
}
