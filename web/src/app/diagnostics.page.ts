import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Api, CatalogItem, errorText } from './api';

const CATEGORIES = [
  { key: 'PATHOLOGY', label: 'Blood and lab tests' },
  { key: 'RADIOLOGY', label: 'Scans and imaging' },
  { key: 'CARDIOLOGY', label: 'Heart tests' },
  { key: 'PACKAGE', label: 'Health packages' },
];

@Component({
  selector: 'app-diagnostics-page',
  imports: [RouterLink],
  template: `
    <h1>Diagnostic tests and scans</h1>
    <p class="muted">Pick a test to compare labs in Tirupati.</p>

    @if (error()) {
      <p class="notice error" role="alert">{{ error() }}</p>
    }
    @for (g of groups(); track g.key) {
      <section>
        <h2>{{ g.label }} <small>{{ g.items.length }}</small></h2>
        <ul class="catalog">
          @for (s of g.items; track s.id) {
            <li><a routerLink="/search" [queryParams]="{ q: s.name }">{{ s.name }}</a></li>
          }
        </ul>
      </section>
    }
  `,
})
export class DiagnosticsPage {
  private items = signal<CatalogItem[]>([]);
  protected error = signal<string | null>(null);

  protected groups = computed(() =>
    CATEGORIES.map((c) => ({ ...c, items: this.items().filter((i) => i.category === c.key) })).filter((g) => g.items.length),
  );

  constructor() {
    inject(Api).catalog().subscribe({
      next: (items) => this.items.set(items),
      error: (e) => this.error.set(errorText(e)),
    });
  }
}
