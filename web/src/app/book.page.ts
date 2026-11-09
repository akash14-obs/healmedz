import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { Api, Auth, BookableOffering, errorText, InrPipe, isValidMobile, TatPipe, todayIso } from './api';
import { PhoneInput } from './phone-input';

function isoDaysAhead(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-book-page',
  imports: [FormsModule, RouterLink, InrPipe, TatPipe, PhoneInput],
  template: `
    <section class="panel narrow">
      <h1>Book this test</h1>
      @if (demo()) {
        <p class="notice">This is a demo. No real lab receives this booking, so please use made-up details.</p>
      }
      @if (offering(); as o) {
        <div class="book-summary">
          <strong>{{ o.serviceName }}</strong>
          <span>{{ o.providerName }}</span>
          <span class="muted">{{ o.price | inr }} · Report in {{ o.reportTatHours | tat }}</span>
        </div>
        <form (ngSubmit)="submit()">
          <label>Patient name <input name="name" required maxlength="100" autocomplete="name" [(ngModel)]="name" /></label>
          <app-phone-input [(value)]="phone" />
          <label>Visit date <input name="date" type="date" required [min]="minDate" [max]="maxDate" [(ngModel)]="date" /></label>
          <label class="check consent">
            <input name="consent" type="checkbox" [(ngModel)]="consent" />
            I agree that HealMedz may share my name, mobile number and chosen test with this lab to handle my booking.
          </label>
          @if (error()) { <p class="notice error" role="alert">{{ error() }}</p> }
          <button class="primary" type="submit" [disabled]="busy()">{{ busy() ? 'Booking…' : 'Confirm booking' }}</button>
        </form>
      } @else if (error()) {
        <p class="notice error" role="alert">{{ error() }}</p>
        <a routerLink="/diagnostics">Browse tests and scans</a>
      } @else {
        <p class="muted">Loading…</p>
      }
    </section>
  `,
})
export class BookPage {
  private api = inject(Api);
  private router = inject(Router);
  private account = inject(Auth).session();

  protected minDate = todayIso();
  protected maxDate = isoDaysAhead(30);
  protected name = signal(this.account?.name ?? '');
  protected phone = signal(this.account?.phone ?? '');
  protected date = signal(todayIso());
  protected consent = signal(false);
  protected offering = signal<BookableOffering | null>(null);
  protected demo = signal(false);
  protected busy = signal(false);
  protected error = signal<string | null>(null);

  constructor() {
    const id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
    this.api.bookableOffering(id).subscribe({
      next: (o) => this.offering.set(o),
      error: (e) => this.error.set(errorText(e)),
    });
    this.api.meta().subscribe({ next: (m) => this.demo.set(m.demoData), error: () => {} });
  }

  protected submit() {
    const offering = this.offering();
    if (!offering) return;
    if (!isValidMobile(this.phone())) {
      this.error.set('Enter a valid 10-digit mobile number.');
      return;
    }
    if (!this.consent()) {
      this.error.set('Please agree to share your details with the lab.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api
      .createBooking({
        offeringId: offering.offeringId, patientName: this.name(), phone: this.phone(), visitDate: this.date(), consent: true,
      })
      .subscribe({
        next: (status) =>
          this.router.navigate(['/booking'], {
            queryParams: { no: status.bookingNumber },
            state: { status, phone: this.phone() },
          }),
        error: (e) => {
          this.error.set(errorText(e));
          this.busy.set(false);
        },
      });
  }
}
