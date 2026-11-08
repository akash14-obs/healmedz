import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, debounceTime, of, Subject, switchMap } from 'rxjs';

import { Api, CatalogItem, LocationOption } from './api';

export const DEFAULT_LOCATION = 'Tirupati';

const TIRUPATI = { lat: 13.6288, lon: 79.4192 };
const COVERAGE_KM = 30;

const EXAMPLES = ['Blood Test', 'MRI', 'CT Scan', 'Thyroid Test', 'Ultrasound', 'Health Package'];

export const INSURERS = [
  'Star Health', 'HDFC ERGO', 'ICICI Lombard', 'Niva Bupa', 'Care Health', 'Aditya Birla Health',
  'New India Assurance', 'United India', 'National Insurance', 'Oriental Insurance',
  'Ayushman Bharat (PM-JAY)', 'Dr. NTR Vaidya Seva',
];

const CATEGORY_LABEL: Record<string, string> = {
  PATHOLOGY: 'Lab test', RADIOLOGY: 'Scan', CARDIOLOGY: 'Heart test', PACKAGE: 'Package',
};

const LOCATION_LABEL: Record<LocationOption['type'], string> = { CITY: 'City', AREA: 'Area', PINCODE: 'Pincode' };

interface Option { value: string; hint: string; current?: boolean; }

type Menu = 'what' | 'where';

/** The main search form. Reads its values from the URL, so it stays in step with the results page. */
@Component({
  selector: 'app-search-bar',
  imports: [FormsModule],
  template: `
    <form class="sb" [class.sb--compact]="compact()" (ngSubmit)="submit()" role="search" aria-label="Search healthcare services">
      <div class="sb-field sb-what" [class.sb-invalid]="missingWhat()">
        <label for="sb-what">What do you need?</label>
        <div class="sb-input">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
          <input id="sb-what" name="what" type="text" role="combobox" autocomplete="off" spellcheck="false"
            placeholder="Blood test, MRI, thyroid…"
            aria-autocomplete="list" aria-controls="sb-what-list"
            [attr.aria-expanded]="menu() === 'what'"
            [attr.aria-activedescendant]="activeId('what')"
            [attr.aria-invalid]="missingWhat()"
            [ngModel]="what()" (ngModelChange)="onWhat($event)"
            (focus)="openMenu('what')" (blur)="closeMenu('what')" (keydown)="onKey($event, 'what')" />
        </div>
        @if (menu() === 'what' && options().length) {
          <ul class="sb-menu" id="sb-what-list" role="listbox" aria-label="Suggestions">
            @if (!what().trim()) { <li class="sb-menu-head" role="presentation">Common searches</li> }
            @for (o of options(); track o.value; let i = $index) {
              <li role="option" [id]="'sb-what-' + i" [class.active]="i === active()" [attr.aria-selected]="i === active()"
                (mousedown)="$event.preventDefault()" (click)="choose(o, 'what')">
                <span>{{ o.value }}</span><small>{{ o.hint }}</small>
              </li>
            }
          </ul>
        }
      </div>

      <div class="sb-field sb-where">
        <label for="sb-where">Location</label>
        <div class="sb-input">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/></svg>
          <input id="sb-where" name="where" type="text" role="combobox" autocomplete="off" spellcheck="false"
            placeholder="City, area or pincode"
            aria-autocomplete="list" aria-controls="sb-where-list"
            [attr.aria-expanded]="menu() === 'where'"
            [attr.aria-activedescendant]="activeId('where')"
            [ngModel]="where()" (ngModelChange)="onWhere($event)"
            (focus)="openMenu('where'); selectText($event)" (blur)="closeMenu('where')" (keydown)="onKey($event, 'where')" />
        </div>
        @if (menu() === 'where') {
          <ul class="sb-menu" id="sb-where-list" role="listbox" aria-label="Locations">
            @for (o of options(); track o.value; let i = $index) {
              <li role="option" [id]="'sb-where-' + i" [class.active]="i === active()" [class.sb-current]="o.current"
                [attr.aria-selected]="i === active()"
                (mousedown)="$event.preventDefault()" (click)="choose(o, 'where')">
                <span>{{ o.value }}</span><small>{{ o.hint }}</small>
              </li>
            }
          </ul>
        }
      </div>

      <div class="sb-field sb-insurance">
        <label for="sb-insurance">Insurance <em>optional</em></label>
        <div class="sb-input">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 5.8v5.4c0 4.6 3 8.1 7 9.8 4-1.7 7-5.2 7-9.8V5.8L12 3Z"/><path d="m9 12 2.2 2.2L15.2 10"/></svg>
          <select id="sb-insurance" name="insurance" [ngModel]="insurance()" (ngModelChange)="insurance.set($event)">
            <option value="">Select insurance</option>
            @for (i of insurers; track i) { <option [value]="i">{{ i }}</option> }
          </select>
        </div>
      </div>

      <button class="sb-submit" type="submit">{{ compact() ? 'Search' : 'Search Healthcare' }}</button>
    </form>
    <p class="sb-note" aria-live="polite">{{ note() }}</p>
  `,
})
export class SearchBar {
  private api = inject(Api);
  private router = inject(Router);

  readonly compact = input(false);

  protected insurers = INSURERS;
  protected what = signal('');
  protected where = signal(DEFAULT_LOCATION);
  protected insurance = signal('');
  protected menu = signal<Menu | null>(null);
  protected active = signal(-1);
  protected note = signal('');
  protected missingWhat = signal(false);

  private suggestions = signal<CatalogItem[]>([]);
  private locations = signal<LocationOption[]>([]);
  private whereEdited = signal(false);
  private typed = new Subject<string>();

  protected options = computed<Option[]>(() => {
    if (this.menu() === 'what') {
      return this.what().trim()
        ? this.suggestions().slice(0, 8).map((s) => ({ value: s.name, hint: CATEGORY_LABEL[s.category] ?? '' }))
        : EXAMPLES.map((value) => ({ value, hint: '' }));
    }
    const text = this.whereEdited() ? this.where().trim().toLowerCase() : '';
    const places = this.locations().length ? this.locations() : [{ label: DEFAULT_LOCATION, type: 'CITY' as const }];
    return [
      { value: 'Use current location', hint: '', current: true },
      ...places
        .filter((p) => p.label.toLowerCase().includes(text))
        .sort((a, b) => order(a) - order(b))
        .slice(0, 8)
        .map((p) => ({ value: p.label, hint: LOCATION_LABEL[p.type] })),
    ];
  });

  constructor() {
    inject(ActivatedRoute).queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.what.set(p.get('q') ?? '');
      this.where.set(p.get('loc') || DEFAULT_LOCATION);
      this.insurance.set(p.get('ins') ?? '');
    });
    this.api.locations().pipe(takeUntilDestroyed()).subscribe({ next: (l) => this.locations.set(l), error: () => {} });
    this.typed
      .pipe(
        debounceTime(150),
        switchMap((q) => (q.trim() ? this.api.catalog(q).pipe(catchError(() => of([]))) : of([]))),
        takeUntilDestroyed(),
      )
      .subscribe((s) => this.suggestions.set(s));
  }

  protected onWhat(value: string) {
    this.what.set(value);
    this.missingWhat.set(false);
    this.menu.set('what');
    this.active.set(-1);
    this.typed.next(value);
  }

  protected onWhere(value: string) {
    this.where.set(value);
    this.whereEdited.set(true);
    this.menu.set('where');
    this.active.set(-1);
  }

  protected openMenu(menu: Menu) {
    this.menu.set(menu);
    this.active.set(-1);
    if (menu === 'what' && this.what().trim()) this.typed.next(this.what());
    if (menu === 'where') this.whereEdited.set(false);
  }

  protected closeMenu(menu: Menu) {
    if (this.menu() === menu) this.menu.set(null);
    if (menu === 'where' && !this.where().trim()) this.where.set(DEFAULT_LOCATION);
  }

  protected selectText(event: Event) {
    (event.target as HTMLInputElement).select();
  }

  protected activeId(menu: Menu) {
    return this.menu() === menu && this.active() >= 0 ? `sb-${menu}-${this.active()}` : null;
  }

  protected onKey(event: KeyboardEvent, menu: Menu) {
    const count = this.options().length;
    if (event.key === 'Escape') {
      this.menu.set(null);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.menu() !== menu) this.menu.set(menu);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.active.update((i) => (i < 0 && step < 0 ? count - 1 : (i + step + count) % count));
    } else if (event.key === 'Enter' && this.menu() === menu && this.active() >= 0) {
      event.preventDefault();
      this.choose(this.options()[this.active()], menu);
    }
  }

  protected choose(option: Option, menu: Menu) {
    this.menu.set(null);
    this.active.set(-1);
    if (option.current) {
      this.useCurrentLocation();
    } else if (menu === 'what') {
      this.what.set(option.value);
      this.missingWhat.set(false);
    } else {
      this.where.set(option.value);
      this.note.set('');
    }
  }

  protected submit() {
    const q = this.what().trim();
    if (!q) {
      this.missingWhat.set(true);
      this.note.set('Tell us the test or scan you need, like MRI or thyroid.');
      document.getElementById('sb-what')?.focus();
      return;
    }
    this.note.set('');
    const where = this.where().trim();
    this.router.navigate(['/search'], {
      queryParams: { q, loc: where && where !== DEFAULT_LOCATION ? where : null, ins: this.insurance() || null },
    });
  }

  /** Branches have no map coordinates yet, so this only confirms the user is within the Tirupati service area. */
  private useCurrentLocation() {
    if (!navigator.geolocation) {
      this.note.set('This browser cannot share your location. Type your area or pincode instead.');
      return;
    }
    this.note.set('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        this.where.set(DEFAULT_LOCATION);
        this.note.set(distanceKm(p.coords.latitude, p.coords.longitude) <= COVERAGE_KM
          ? 'You are in the Tirupati area, so we will show labs across Tirupati.'
          : 'You seem to be outside Tirupati. We only cover Tirupati for now, so we kept it selected.');
      },
      () => this.note.set('We could not get your location. Type your area or pincode instead.'),
      { timeout: 10000, maximumAge: 600000 },
    );
  }
}

function order(p: LocationOption) {
  return p.type === 'CITY' ? 0 : p.type === 'AREA' ? 1 : 2;
}

function distanceKm(lat: number, lon: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat - TIRUPATI.lat);
  const dLon = rad(lon - TIRUPATI.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(TIRUPATI.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
