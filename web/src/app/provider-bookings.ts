import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Api, BookingState, errorText, QueueEntry, todayIso } from './api';

const STATE_TEXT: Record<BookingState, string> = {
  WAITING: 'Waiting',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** A lab's daily token queue. Moving patients along updates what each patient sees. */
@Component({
  selector: 'app-provider-bookings',
  imports: [FormsModule],
  template: `
    @if (error()) { <p class="notice error" role="alert">{{ error() }}</p> }
    <section class="panel">
      <form class="filters" (ngSubmit)="saveMinutes()">
        <label>Date <input name="date" type="date" [ngModel]="date()" (ngModelChange)="pickDate($event)" /></label>
        <label>Minutes per patient <input name="minutes" type="number" min="1" max="240" required [(ngModel)]="minutes" /></label>
        <button type="submit" [disabled]="busy()">Save minutes</button>
        <button type="button" [disabled]="busy()" (click)="load()">Refresh</button>
      </form>

      @if (bookings().length === 0) { <p class="muted">No bookings for this date.</p> }
      @else {
        <div class="table-scroll">
          <table class="data">
            <thead><tr><th>Token</th><th>Patient</th><th>Test</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (b of bookings(); track b.id) {
                <tr [class.inactive]="b.status === 'COMPLETED' || b.status === 'CANCELLED'">
                  <td><strong>{{ b.token }}</strong></td>
                  <td>{{ b.patientName }}<br /><a [href]="'tel:+91' + b.patientPhone">{{ b.patientPhone }}</a></td>
                  <td>{{ b.serviceName }}<br /><small class="muted">{{ b.bookingNumber }}</small></td>
                  <td><span class="pill">{{ stateText[b.status] }}</span></td>
                  <td class="row-actions">
                    @if (b.status === 'WAITING') { <button class="link" type="button" (click)="set(b, 'IN_PROGRESS')">Start</button> }
                    @if (b.status === 'IN_PROGRESS') { <button class="link" type="button" (click)="set(b, 'COMPLETED')">Complete</button> }
                    @if (b.status === 'WAITING' || b.status === 'IN_PROGRESS') { <button class="link" type="button" (click)="set(b, 'CANCELLED')">Cancel</button> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class ProviderBookings {
  private api = inject(Api);

  protected stateText = STATE_TEXT;
  protected date = signal(todayIso());
  protected minutes = signal(15);
  protected bookings = signal<QueueEntry[]>([]);
  protected busy = signal(false);
  protected error = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected pickDate(date: string) {
    this.date.set(date);
    if (date) this.load();
  }

  protected load() {
    this.busy.set(true);
    this.error.set(null);
    this.api.labQueue(this.date()).subscribe({
      next: (q) => {
        this.minutes.set(q.minutesPerPatient);
        this.bookings.set(q.bookings);
        this.busy.set(false);
      },
      error: (e) => this.fail(e),
    });
  }

  protected set(booking: QueueEntry, status: BookingState) {
    this.error.set(null);
    this.api.setBookingStatus(booking.id, status).subscribe({ next: () => this.load(), error: (e) => this.fail(e) });
  }

  protected saveMinutes() {
    this.busy.set(true);
    this.api.saveQueueSettings(this.minutes()).subscribe({ next: () => this.load(), error: (e) => this.fail(e) });
  }

  private fail(e: unknown) {
    this.error.set(errorText(e));
    this.busy.set(false);
  }
}
