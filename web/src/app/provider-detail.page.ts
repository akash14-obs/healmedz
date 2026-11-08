import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, EMPTY, switchMap } from 'rxjs';

import { Api, errorText, HistoryEntry, InrPipe, ProviderDetail, SourcePipe, TatPipe } from './api';

@Component({
  selector: 'app-provider-detail-page',
  imports: [RouterLink, DatePipe, InrPipe, TatPipe, SourcePipe],
  template: `
    <a routerLink="/" class="back">← Back to search</a>
    @if (error()) {
      <p class="notice error" role="alert">{{ error() }}</p>
    }
    @if (detail(); as d) {
      <article class="panel">
        <h1>{{ d.profile.data.name }}</h1>
        @if (d.profile.data.description) { <p>{{ d.profile.data.description }}</p> }
        <p class="provenance">
          <span class="seal">✓ Profile verified {{ d.profile.verifiedAt | date: 'd MMM y' }}</span>
          {{ d.profile.sourceType | source }}
        </p>
        <div class="contact-row">
          <a class="button primary" [href]="'tel:' + dial(d.profile.data.phone)">Call {{ d.profile.data.phone }}</a>
          @if (d.profile.data.email) { <span class="muted">{{ d.profile.data.email }}</span> }
        </div>
        @if (d.profile.data.facilities) { <p><b>Facilities:</b> {{ d.profile.data.facilities }}</p> }
        <h2>Branches</h2>
        <ul class="branches">
          @for (b of d.profile.data.branches; track $index) {
            <li>
              <b>{{ b.name }}</b><br />
              {{ b.address }}@if (b.locality) {, {{ b.locality }}}, {{ b.city }} {{ b.pincode }}<br />
              @if (b.workingHours) { <span class="muted">{{ b.workingHours }}</span> }
            </li>
          }
        </ul>
      </article>

      <h2>Tests and scans</h2>
      @if (d.offerings.length === 0) { <p class="muted">No verified prices are listed for this lab yet.</p> }
      <ul class="result-list">
        @for (o of d.offerings; track o.offeringId) {
          <li class="result detail">
            <div class="result-lab"><span class="lab-name">{{ o.serviceName }}</span></div>
            <div class="result-price">
              <strong>{{ o.discountedPrice ?? o.regularPrice | inr }}</strong>
              @if (o.discountedPrice != null) { <s>{{ o.regularPrice | inr }}</s> }
            </div>
            <dl class="result-facts">
              <div><dt>Report</dt><dd>{{ o.reportTatHours | tat }}</dd></div>
              <div><dt>Home collection</dt><dd>{{ o.homeCollection ? 'Yes' : 'No' }}</dd></div>
            </dl>
            <button class="link" type="button" [attr.aria-expanded]="openId() === o.offeringId" (click)="toggle(o.offeringId)">
              {{ openId() === o.offeringId ? 'Hide history' : 'Price history' }}
            </button>
            <p class="provenance">
              <span class="seal">✓ Verified {{ o.verifiedAt | date: 'd MMM y' }}</span>
              {{ o.sourceType | source }} · Effective {{ o.effectiveFrom | date: 'd MMM y' }}
            </p>
            @if (openId() === o.offeringId) {
              <table class="history">
                <thead><tr><th>Effective from</th><th>Price</th><th>Report</th><th>Verified</th></tr></thead>
                <tbody>
                  @for (h of history(); track $index) {
                    <tr>
                      <td>{{ h.effectiveFrom | date: 'd MMM y' }}</td>
                      <td>{{ h.discountedPrice ?? h.regularPrice | inr }}</td>
                      <td>{{ h.reportTatHours | tat }}</td>
                      <td>{{ h.verifiedAt | date: 'd MMM y' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class ProviderDetailPage {
  private api = inject(Api);
  protected detail = signal<ProviderDetail | null>(null);
  protected error = signal<string | null>(null);
  protected openId = signal<number | null>(null);
  protected history = signal<HistoryEntry[]>([]);

  constructor() {
    inject(ActivatedRoute).paramMap
      .pipe(
        takeUntilDestroyed(),
        switchMap((p) =>
          this.api.provider(Number(p.get('id'))).pipe(
            catchError((e) => {
              this.error.set(errorText(e));
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe((d) => this.detail.set(d));
  }

  toggle(id: number) {
    if (this.openId() === id) {
      this.openId.set(null);
      return;
    }
    this.history.set([]);
    this.openId.set(id);
    this.api.history(id).subscribe({
      next: (h) => this.history.set(h),
      error: (e) => this.error.set(errorText(e)),
    });
  }

  dial(phone: string) {
    return phone.replace(/[^+0-9]/g, '');
  }
}
