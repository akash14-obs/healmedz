import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { Api, BookingState, BookingStatus, errorText, InrPipe } from './api';

const STATE_TEXT: Record<BookingState, string> = {
  WAITING: 'Waiting',
  IN_PROGRESS: 'Your turn now',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

@Component({
  selector: 'app-booking-page',
  imports: [FormsModule, DatePipe, InrPipe],
  template: `
    @if (status(); as s) {
      <section class="panel narrow ticket">
        <p class="ticket-state" [class.done]="s.status !== 'WAITING'">{{ stateText[s.status] }}</p>
        <p class="muted ticket-label">Booking number</p>
        <p class="ticket-number">{{ s.bookingNumber }}</p>
        <p><strong>{{ s.serviceName }}</strong><br />{{ s.providerName }}<br />
          <span class="muted">{{ s.visitDate | date: 'EEE, d MMM y' }} · {{ s.price | inr }}</span></p>

        <dl class="ticket-facts">
          <div><dt>Your token</dt><dd>{{ s.token }}</dd></div>
          <div><dt>People ahead</dt><dd>{{ s.peopleAhead }}</dd></div>
          <div><dt>Estimated wait</dt><dd>{{ s.estimatedWaitMinutes ? 'About ' + s.estimatedWaitMinutes + ' min' : 'No wait' }}</dd></div>
        </dl>
        <p class="muted ticket-note">This is an estimate from online bookings. Walk-in patients are not counted, so please confirm the timing with the lab.</p>

        <div class="ticket-actions">
          @if (phone()) {
            <a class="button primary" target="_blank" rel="noopener" [href]="whatsappUrl()">Save on WhatsApp</a>
            <a class="button" [href]="smsUrl()">Save by SMS</a>
          }
          <button type="button" [disabled]="busy()" (click)="refresh()">{{ busy() ? 'Refreshing…' : 'Refresh' }}</button>
          @if (dial(s.providerPhone); as tel) { <a class="button" [href]="'tel:' + tel">Call lab</a> }
        </div>
        @if (error()) { <p class="notice error" role="alert">{{ error() }}</p> }
      </section>
    } @else {
      <section class="panel narrow">
        <h1>Track your booking</h1>
        <p class="muted">Enter your booking number and the mobile number you booked with.</p>
        <form (ngSubmit)="find()">
          <label>Booking number <input name="number" required autocomplete="off" placeholder="HM-XXXXXXXX" [(ngModel)]="number" /></label>
          <label>Mobile number <input name="phone" type="tel" required inputmode="numeric" autocomplete="tel" [(ngModel)]="phone" /></label>
          @if (error()) { <p class="notice error" role="alert">{{ error() }}</p> }
          <button class="primary" type="submit" [disabled]="busy()">{{ busy() ? 'Finding…' : 'Find booking' }}</button>
        </form>
      </section>
    }
  `,
})
export class BookingPage {
  private api = inject(Api);

  protected stateText = STATE_TEXT;
  protected number = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('no') ?? '');
  protected phone = signal('');
  protected status = signal<BookingStatus | null>(null);
  protected busy = signal(false);
  protected error = signal<string | null>(null);

  private message = computed(() => {
    const s = this.status();
    if (!s) return '';
    return [
      `HealMedz booking ${s.bookingNumber}`,
      `${s.serviceName} at ${s.providerName}`,
      `Date: ${s.visitDate}`,
      `Token: ${s.token}`,
      `People ahead: ${s.peopleAhead}`,
      `Estimated wait: ${s.estimatedWaitMinutes ? `about ${s.estimatedWaitMinutes} min` : 'no wait'}`,
    ].join('\n');
  });

  protected whatsappUrl = computed(() => `https://wa.me/91${this.mobile()}?text=${encodeURIComponent(this.message())}`);
  protected smsUrl = computed(() => `sms:+91${this.mobile()}?&body=${encodeURIComponent(this.message())}`);

  constructor() {
    const state = inject(Router).currentNavigation()?.extras.state as { status: BookingStatus; phone: string } | undefined;
    if (state) {
      this.status.set(state.status);
      this.phone.set(state.phone);
      // The browser restores this state on reload, so fetch the live queue position.
      this.refresh();
    }
  }

  protected find() {
    this.load(this.number());
  }

  protected refresh() {
    this.load(this.status()!.bookingNumber);
  }

  private load(number: string) {
    this.busy.set(true);
    this.error.set(null);
    this.api.lookupBooking(number, this.phone()).subscribe({
      next: (s) => {
        this.status.set(s);
        this.busy.set(false);
      },
      error: (e) => {
        this.error.set(errorText(e));
        this.busy.set(false);
      },
    });
  }

  private mobile() {
    return this.phone().replace(/\D/g, '').slice(-10);
  }

  protected dial(phone: string | null) {
    return phone ? phone.replace(/[^+0-9]/g, '') : '';
  }
}
