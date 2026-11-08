import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Api, errorText, InrPipe, Queue, TatPipe } from './api';

@Component({
  selector: 'app-admin-page',
  imports: [FormsModule, DatePipe, InrPipe, TatPipe],
  template: `
    <h1>Verification queue</h1>
    <p class="muted">{{ total() }} waiting. Nothing reaches patients until it is approved here.</p>
    @if (error()) { <p class="notice error" role="alert">{{ error() }}</p> }

    @if (queue(); as q) {
      <h2>Lab profiles</h2>
      @if (q.profiles.length === 0) { <p class="muted">No profiles waiting.</p> }
      @for (p of q.profiles; track p.versionId) {
        <article class="panel review">
          <h3>{{ p.data.name }} @if (p.publishedData) { <span class="pill">Update to live lab</span> } @else { <span class="pill">New lab</span> }</h3>
          <p class="muted">{{ p.ownerEmail }} · Submitted {{ p.submittedAt | date: 'd MMM y, h:mm a' }}</p>
          <p>Phone: {{ p.data.phone }} · License: {{ p.data.licenseNumber || 'Not given' }}</p>
          @if (p.data.facilities) { <p>Facilities: {{ p.data.facilities }}</p> }
          <ul class="branches">
            @for (b of p.data.branches; track $index) {
              <li><b>{{ b.name }}</b>: {{ b.address }}, {{ b.locality }}, {{ b.city }} {{ b.pincode }}. {{ b.workingHours }}</li>
            }
          </ul>
          <div class="review-actions">
            <input [name]="'note-p-' + p.versionId" [(ngModel)]="notes['p' + p.versionId]" placeholder="Note (required to reject)" aria-label="Review note" />
            <button class="primary" type="button" [disabled]="busy()" (click)="decide('profiles', p.versionId, 'p', 'APPROVE')">Approve</button>
            <button type="button" [disabled]="busy()" (click)="decide('profiles', p.versionId, 'p', 'REJECT')">Reject</button>
          </div>
        </article>
      }

      <h2>Prices and services</h2>
      @if (q.offerings.length === 0) { <p class="muted">No prices waiting.</p> }
      @for (o of q.offerings; track o.versionId) {
        <article class="panel review">
          <h3>{{ o.serviceName }}</h3>
          <p class="muted">{{ o.providerName }} · {{ o.ownerEmail }} · Submitted {{ o.submittedAt | date: 'd MMM y, h:mm a' }}</p>
          <p class="change">
            @if (o.publishedPrice != null) {
              <span class="muted">Live now {{ o.publishedDiscount ?? o.publishedPrice | inr }}</span> →
            } @else {
              <span class="muted">New listing</span> →
            }
            <strong>{{ o.discountedPrice ?? o.regularPrice | inr }}</strong>
            @if (o.discountedPrice != null) { <s>{{ o.regularPrice | inr }}</s> }
          </p>
          <p>Report {{ o.reportTatHours | tat }} · Home collection {{ o.homeCollection ? 'Yes' : 'No' }} · Effective {{ o.effectiveFrom | date: 'd MMM y' }}</p>
          @if (o.sourceNote) { <p>Lab's note: {{ o.sourceNote }}</p> }
          <div class="review-actions">
            <input [name]="'note-o-' + o.versionId" [(ngModel)]="notes['o' + o.versionId]" placeholder="Note (required to reject)" aria-label="Review note" />
            <button class="primary" type="button" [disabled]="busy()" (click)="decide('offerings', o.versionId, 'o', 'APPROVE')">Approve</button>
            <button type="button" [disabled]="busy()" (click)="decide('offerings', o.versionId, 'o', 'REJECT')">Reject</button>
          </div>
        </article>
      }
    }
  `,
})
export class AdminPage {
  private api = inject(Api);
  protected queue = signal<Queue | null>(null);
  protected busy = signal(false);
  protected error = signal<string | null>(null);
  protected notes: Record<string, string> = {};
  protected total = computed(() => (this.queue()?.profiles.length ?? 0) + (this.queue()?.offerings.length ?? 0));

  constructor() {
    this.load();
  }

  private load() {
    this.api.queue().subscribe({
      next: (q) => {
        this.queue.set(q);
        this.busy.set(false);
      },
      error: (e) => this.fail(e),
    });
  }

  protected decide(kind: 'profiles' | 'offerings', id: number, prefix: string, decision: 'APPROVE' | 'REJECT') {
    this.busy.set(true);
    this.error.set(null);
    this.api.review(kind, id, decision, this.notes[prefix + id] ?? '').subscribe({
      next: () => this.load(),
      error: (e) => {
        this.fail(e);
        this.load();
      },
    });
  }

  private fail(e: unknown) {
    this.busy.set(false);
    this.error.set(errorText(e));
  }
}
