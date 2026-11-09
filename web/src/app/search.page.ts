import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';

import { Api, errorText, InrPipe, Offering, SourcePipe, TatPipe } from './api';
import { DEFAULT_LOCATION, SearchBar } from './search-bar';

interface Group { service: string; items: Offering[]; lowest: number; }

@Component({
  selector: 'app-search-page',
  imports: [FormsModule, RouterLink, DatePipe, InrPipe, TatPipe, SourcePipe, SearchBar],
  template: `
    <app-search-bar [compact]="true" />

    @if (!searched()) {
      <div class="empty">
        <h2>What would you like to compare?</h2>
        <p class="muted">Search above, or <a routerLink="/diagnostics">browse all tests and scans</a>.</p>
      </div>
    } @else {
      <h1 class="results-title">{{ q }} <span>in {{ location() }}</span></h1>

      @if (insurance()) {
        <p class="notice" role="note">
          These results are not filtered by {{ insurance() }} because we do not have insurance network information yet.
          Please confirm coverage with the lab and your insurer.
        </p>
      }

      <form class="filters" (ngSubmit)="apply()">
        <label class="check"><input type="checkbox" name="home" [(ngModel)]="home" (ngModelChange)="apply()" /> Home collection</label>
        <label>Max price (₹)
          <input type="number" min="1" name="max" [(ngModel)]="max" (change)="apply()" />
        </label>
        <label>Sort by
          <select name="sort" [(ngModel)]="sort" (ngModelChange)="apply()">
            <option value="price">Lowest price</option>
            <option value="tat">Fastest report</option>
          </select>
        </label>
      </form>

      @if (error()) {
        <p class="notice error" role="alert">{{ error() }}</p>
      } @else if (loading()) {
        <p class="muted">Searching…</p>
      } @else if (groups().length === 0) {
        <div class="empty">
          <h2>No verified listings match that search</h2>
          <p class="muted">Try a shorter name, such as “thyroid”, remove a filter, or search all of Tirupati. We only cover Tirupati for now.</p>
        </div>
      }

      @for (g of groups(); track g.service) {
        <section class="service-group">
          <h2>{{ g.service }} <small>{{ g.items.length }} {{ g.items.length === 1 ? 'lab' : 'labs' }}</small></h2>
          <ul class="result-list">
            @for (o of g.items; track o.offeringId) {
              <li class="result">
                <div class="result-lab">
                  <a class="lab-name" [routerLink]="['/labs', o.providerId]">{{ o.providerName }}</a>
                  <span class="muted">{{ o.localities }}</span>
                </div>
                <div class="result-price">
                  <strong>{{ priceOf(o) | inr }}</strong>
                  @if (o.discountedPrice != null) { <s>{{ o.regularPrice | inr }}</s> }
                  @if (g.items.length > 1 && priceOf(o) === g.lowest) { <em class="tag">Lowest listed</em> }
                </div>
                <dl class="result-facts">
                  <div><dt>Report</dt><dd>{{ o.reportTatHours | tat }}</dd></div>
                  <div><dt>Home collection</dt><dd>{{ o.homeCollection ? 'Yes' : 'No' }}</dd></div>
                </dl>
                <div class="result-actions">
                  <a class="button primary" [routerLink]="['/book', o.offeringId]">Book</a>
                  <a class="button" [href]="'tel:' + dial(o.phone)">Call</a>
                </div>
                <p class="provenance">
                  <span class="seal">✓ Verified {{ o.verifiedAt | date: 'd MMM y' }}</span>
                  {{ o.sourceType | source }} · Effective {{ o.effectiveFrom | date: 'd MMM y' }}
                </p>
              </li>
            }
          </ul>
        </section>
      }
    }
  `,
})
export class SearchPage {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  protected q = '';
  protected location = signal(DEFAULT_LOCATION);
  protected insurance = signal('');
  protected home = false;
  protected max: number | null = null;
  protected sort = 'price';

  protected searched = signal(false);
  protected loading = signal(false);
  protected error = signal<string | null>(null);
  private results = signal<Offering[]>([]);

  protected groups = computed<Group[]>(() => {
    const groups = new Map<string, Offering[]>();
    for (const o of this.results()) {
      groups.set(o.serviceName, [...(groups.get(o.serviceName) ?? []), o]);
    }
    return [...groups].map(([service, items]) => ({
      service,
      items,
      lowest: Math.min(...items.map((i) => this.priceOf(i))),
    }));
  });

  constructor() {
    this.route.queryParamMap
      .pipe(
        takeUntilDestroyed(),
        switchMap((p) => {
          this.q = p.get('q') ?? '';
          this.location.set(p.get('loc') || DEFAULT_LOCATION);
          this.insurance.set(p.get('ins') ?? '');
          this.home = p.get('home') === '1';
          const max = Number(p.get('max'));
          this.max = max > 0 ? max : null;
          this.sort = p.get('sort') === 'tat' ? 'tat' : 'price';
          this.error.set(null);
          this.searched.set(!!this.q.trim());
          if (!this.q.trim()) {
            return of([] as Offering[]);
          }
          this.loading.set(true);
          return this.api.search({ q: this.q, location: this.location(), home: this.home, max: this.max, sort: this.sort }).pipe(
            catchError((e) => {
              this.error.set(errorText(e));
              return of([] as Offering[]);
            }),
          );
        }),
      )
      .subscribe((r) => {
        this.results.set(r);
        this.loading.set(false);
      });
  }

  apply() {
    this.router.navigate(['/search'], {
      queryParamsHandling: 'merge',
      queryParams: {
        home: this.home ? 1 : null,
        max: this.max || null,
        sort: this.sort === 'price' ? null : this.sort,
      },
    });
  }

  priceOf(o: Offering) {
    return o.discountedPrice ?? o.regularPrice;
  }

  dial(phone: string) {
    return phone.replace(/[^+0-9]/g, '');
  }
}
