import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  Api, CatalogItem, Dashboard, emptyBranch, errorText, InrPipe, OfferingRequest, ProfileData, ProviderOffering, todayIso,
} from './api';

const STATUS_TEXT: Record<string, string> = {
  PENDING: 'Awaiting verification',
  APPROVED: 'Verified',
  REJECTED: 'Needs changes',
};

function blankOffering(): OfferingRequest {
  return {
    catalogServiceId: null, regularPrice: null, discountedPrice: null, homeCollection: false,
    reportTatHours: 24, effectiveFrom: todayIso(), sourceNote: '',
  };
}

@Component({
  selector: 'app-provider-dashboard-page',
  imports: [FormsModule, DatePipe, InrPipe],
  template: `
    <h1>My lab</h1>
    @if (message()) { <p class="notice ok" role="status">{{ message() }}</p> }
    @if (error()) { <p class="notice error" role="alert">{{ error() }}</p> }

    @if (dash(); as d) {
      <p class="notice" [class.ok]="d.published">
        @if (d.published) { Your lab is visible to patients. Changes stay private until they are verified. }
        @else { Your lab is not visible to patients yet. Submit your profile and services for verification. }
      </p>
    }

    <div class="tabs" role="tablist">
      <button type="button" role="tab" [attr.aria-selected]="tab() === 'services'" (click)="tab.set('services')">Services and prices</button>
      <button type="button" role="tab" [attr.aria-selected]="tab() === 'profile'" (click)="tab.set('profile')">Profile</button>
    </div>

    @if (tab() === 'services') {
      <section class="panel">
        <h2>{{ editing() ? 'Update price' : 'Add a service' }}</h2>
        <form class="grid-form" (ngSubmit)="saveOffering()">
          <label class="wide">Service
            <select name="service" required [(ngModel)]="offer().catalogServiceId" [disabled]="editing()">
              <option [ngValue]="null">Choose a test or scan</option>
              @for (g of catalogGroups(); track g.category) {
                <optgroup [label]="g.category">
                  @for (c of g.items; track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
                </optgroup>
              }
            </select>
          </label>
          <label>Regular price (₹) <input name="regular" type="number" min="1" required [(ngModel)]="offer().regularPrice" /></label>
          <label>Discounted price (₹) <input name="discount" type="number" min="1" [(ngModel)]="offer().discountedPrice" /></label>
          <label>Report time (hours) <input name="tat" type="number" min="1" required [(ngModel)]="offer().reportTatHours" /></label>
          <label>Effective from <input name="effective" type="date" required [(ngModel)]="offer().effectiveFrom" /></label>
          <label class="check"><input name="home" type="checkbox" [(ngModel)]="offer().homeCollection" /> Home collection available</label>
          <label class="wide">Note for the reviewer (optional) <input name="note" maxlength="300" [(ngModel)]="offer().sourceNote" /></label>
          <div class="wide actions">
            <button class="primary" type="submit" [disabled]="busy()">Submit for verification</button>
            @if (editing()) { <button type="button" (click)="resetOffer()">Cancel</button> }
          </div>
        </form>
      </section>

      <section>
        <h2>Your services</h2>
        @if (offerings().length === 0) { <p class="muted">Nothing added yet.</p> }
        <div class="table-scroll">
          <table class="data">
            <thead><tr><th>Service</th><th>Live price</th><th>Latest submission</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (o of offerings(); track o.offeringId) {
                <tr [class.inactive]="!o.active">
                  <td>{{ o.serviceName }}</td>
                  <td>
                    {{ o.publishedDiscount ?? o.publishedPrice | inr }}
                    @if (o.verifiedAt) { <br /><small class="muted">Verified {{ o.verifiedAt | date: 'd MMM y' }}</small> }
                  </td>
                  <td>
                    {{ o.latestDiscount ?? o.latestPrice | inr }}
                    @if (o.latestEffectiveFrom) { <br /><small class="muted">From {{ o.latestEffectiveFrom | date: 'd MMM y' }}</small> }
                  </td>
                  <td>
                    @if (!o.active) { <span class="pill">Withdrawn</span> }
                    @else { <span class="pill" [class]="'pill ' + o.latestStatus">{{ statusText(o.latestStatus) }}</span> }
                    @if (o.latestStatus === 'REJECTED' && o.latestNote) { <br /><small>{{ o.latestNote }}</small> }
                  </td>
                  <td class="row-actions">
                    <button class="link" type="button" (click)="edit(o)">Update</button>
                    <button class="link" type="button" (click)="toggleActive(o)">{{ o.active ? 'Withdraw' : 'Resume' }}</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }

    @if (tab() === 'profile' && profile(); as p) {
      <section class="panel">
        @if (dash()?.latest; as l) {
          <p>
            <span [class]="'pill ' + l.status">{{ statusText(l.status) }}</span>
            @if (l.status === 'REJECTED' && l.reviewNote) { <span> {{ l.reviewNote }}</span> }
          </p>
        }
        <form class="grid-form" (ngSubmit)="saveProfile()">
          <label class="wide">Lab name <input name="name" required maxlength="150" [(ngModel)]="p.name" /></label>
          <label>Phone <input name="phone" required [(ngModel)]="p.phone" /></label>
          <label>Email <input name="email" type="email" [(ngModel)]="p.email" /></label>
          <label>Website <input name="website" [(ngModel)]="p.website" /></label>
          <label>License or registration no. <input name="license" [(ngModel)]="p.licenseNumber" /></label>
          <label class="wide">About the lab <textarea name="description" rows="3" maxlength="1000" [(ngModel)]="p.description"></textarea></label>
          <label class="wide">Facilities <input name="facilities" maxlength="500" [(ngModel)]="p.facilities" placeholder="Parking, wheelchair access, NABL accredited" /></label>

          @for (b of p.branches; track $index; let i = $index) {
            <fieldset class="wide grid-form">
              <legend>Branch {{ i + 1 }}</legend>
              <label>Branch name <input [name]="'b-name-' + i" required [(ngModel)]="b.name" /></label>
              <label>Locality <input [name]="'b-locality-' + i" [(ngModel)]="b.locality" /></label>
              <label class="wide">Address <input [name]="'b-address-' + i" required [(ngModel)]="b.address" /></label>
              <label>City <input [name]="'b-city-' + i" required [(ngModel)]="b.city" /></label>
              <label>Pincode <input [name]="'b-pin-' + i" inputmode="numeric" maxlength="6" [(ngModel)]="b.pincode" /></label>
              <label>Branch phone <input [name]="'b-phone-' + i" [(ngModel)]="b.phone" /></label>
              <label>Working hours <input [name]="'b-hours-' + i" [(ngModel)]="b.workingHours" /></label>
              @if (p.branches.length > 1) {
                <button class="link wide" type="button" (click)="p.branches.splice(i, 1)">Remove this branch</button>
              }
            </fieldset>
          }
          <div class="wide actions">
            <button type="button" (click)="p.branches.push(newBranch())">Add branch</button>
            <button class="primary" type="submit" [disabled]="busy()">Submit for verification</button>
          </div>
        </form>
      </section>
    }
  `,
})
export class ProviderDashboardPage {
  private api = inject(Api);

  protected tab = signal<'services' | 'profile'>('services');
  protected dash = signal<Dashboard | null>(null);
  protected profile = signal<ProfileData | null>(null);
  protected offerings = signal<ProviderOffering[]>([]);
  protected catalog = signal<CatalogItem[]>([]);
  protected offer = signal<OfferingRequest>(blankOffering());
  protected editing = signal(false);
  protected busy = signal(false);
  protected message = signal<string | null>(null);
  protected error = signal<string | null>(null);
  protected newBranch = emptyBranch;

  protected catalogGroups = computed(() => {
    const categories = [...new Set(this.catalog().map((c) => c.category))];
    return categories.map((category) => ({ category, items: this.catalog().filter((c) => c.category === category) }));
  });

  constructor() {
    this.api.catalog().subscribe({ next: (c) => this.catalog.set(c), error: (e) => this.fail(e) });
    this.loadDashboard();
    this.loadOfferings();
  }

  private loadDashboard() {
    this.api.dashboard().subscribe({
      next: (d) => {
        this.dash.set(d);
        this.profile.set(d.latest ? structuredClone(d.latest.data) : {
          name: '', description: '', phone: '', email: '', website: '', licenseNumber: '', facilities: '',
          branches: [emptyBranch()],
        });
      },
      error: (e) => this.fail(e),
    });
  }

  private loadOfferings() {
    this.api.myOfferings().subscribe({ next: (o) => this.offerings.set(o), error: (e) => this.fail(e) });
  }

  protected statusText(status: string | null) {
    return status ? (STATUS_TEXT[status] ?? status) : '—';
  }

  protected edit(o: ProviderOffering) {
    this.offer.set({
      catalogServiceId: o.serviceId,
      regularPrice: o.latestPrice,
      discountedPrice: o.latestDiscount,
      homeCollection: !!o.latestHomeCollection,
      reportTatHours: o.latestTatHours,
      effectiveFrom: todayIso(),
      sourceNote: '',
    });
    this.editing.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected resetOffer() {
    this.offer.set(blankOffering());
    this.editing.set(false);
  }

  protected saveOffering() {
    const body = { ...this.offer(), discountedPrice: this.offer().discountedPrice || null };
    if (!body.catalogServiceId) {
      this.error.set('Choose a test or scan first.');
      return;
    }
    this.start();
    this.api.submitOffering(body).subscribe({
      next: () => {
        this.done('Submitted. It goes live once verified.');
        this.resetOffer();
        this.loadOfferings();
      },
      error: (e) => this.fail(e),
    });
  }

  protected toggleActive(o: ProviderOffering) {
    this.start();
    this.api.setActive(o.offeringId, !o.active).subscribe({
      next: () => {
        this.done(o.active ? 'Withdrawn. Patients no longer see this service.' : 'Service resumed.');
        this.loadOfferings();
      },
      error: (e) => this.fail(e),
    });
  }

  protected saveProfile() {
    this.start();
    this.api.submitProfile(this.profile()!).subscribe({
      next: () => {
        this.done('Profile submitted for verification.');
        this.loadDashboard();
      },
      error: (e) => this.fail(e),
    });
  }

  private start() {
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
  }

  private done(text: string) {
    this.busy.set(false);
    this.message.set(text);
  }

  private fail(e: unknown) {
    this.busy.set(false);
    this.error.set(errorText(e));
  }
}
