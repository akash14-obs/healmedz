import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SearchBar } from './search-bar';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, SearchBar],
  template: `
    <section class="home-hero">
      <div class="home-wrap">
        <p class="home-live"><span aria-hidden="true"></span>Now live: diagnostic labs in Tirupati</p>
        <h1>Find the right healthcare option near you.</h1>
        <p class="home-lede">Compare services, prices, providers and healthcare information in one place.</p>
        <app-search-bar />
        <div class="home-try">
          <span>Try</span>
          @for (t of shortcuts; track t) {
            <a routerLink="/search" [queryParams]="{ q: t }">{{ t }}</a>
          }
        </div>
      </div>
    </section>

    <section class="home-section home-compare">
      <div class="home-wrap home-split">
        <div>
          <h2>See the options side by side, before you spend.</h2>
          <p>Stop calling ten centres to ask the same questions. Price, report time and home collection sit in one list, and
            you contact the lab you choose directly.</p>
          <p>Every price shows where it came from and when someone last checked it. If it changes, the old price stays on
            record instead of being overwritten.</p>
          <a class="home-link" routerLink="/diagnostics">Browse all tests and scans</a>
        </div>

        <figure class="sample">
          <figcaption>
            <strong>MRI in Tirupati</strong>
            <span>Example only, not real labs or prices</span>
          </figcaption>
          <ul>
            @for (s of samples; track s.lab) {
              <li>
                <span class="sample-lab">{{ s.lab }}</span>
                <span class="sample-price">{{ s.price }}</span>
                <span class="sample-fact">Report: {{ s.report }}</span>
                <span class="sample-fact">Home collection: {{ s.home }}</span>
              </li>
            }
          </ul>
          <p class="sample-proof">
            <b>Provider declared price</b>
            <span>Verified: October 2026</span>
            <span>Last updated: November 2026</span>
          </p>
        </figure>
      </div>
    </section>

    <section class="home-section home-steps">
      <div class="home-wrap">
        <h2>No price is published without a check</h2>
        <ol>
          <li><h3>The lab submits</h3><p>Services, prices, report times and home collection go in through the lab's dashboard.</p></li>
          <li><h3>We verify</h3><p>Our team reviews each change and records its source and date.</p></li>
          <li><h3>It gets approved</h3><p>Only approved information is published. Rejected changes never appear.</p></li>
          <li><h3>You compare</h3><p>You see the latest approved price with its verification date, then confirm with the lab.</p></li>
        </ol>
      </div>
    </section>

    <section class="home-section">
      <div class="home-wrap">
        <h2>Diagnostics first. More of your healthcare journey next.</h2>
        <ul class="home-roadmap">
          <li class="is-live">
            <a routerLink="/diagnostics"><b>Diagnostics</b><span>Compare tests and scans across labs</span><em>Live</em></a>
          </li>
          @for (r of roadmap; track r.path) {
            <li><a [routerLink]="r.path"><b>{{ r.name }}</b><span>{{ r.text }}</span><em>Coming later</em></a></li>
          }
        </ul>
      </div>
    </section>

    <section class="home-labs">
      <div class="home-wrap">
        <div>
          <h2>Run a diagnostic lab in Tirupati?</h2>
          <p>List your tests and prices for free. Our team verifies them, then patients can find you and contact you directly.</p>
        </div>
        <a class="home-labs-cta" routerLink="/login" [queryParams]="{ mode: 'register' }">List your lab</a>
      </div>
    </section>
  `,
})
export class HomePage {
  protected shortcuts = ['CBC', 'Thyroid', 'HbA1c', 'Lipid Profile', 'X-Ray', 'ECG'];

  protected samples = [
    { lab: 'Lab A', price: '₹3,500', report: '24 hrs', home: 'No' },
    { lab: 'Lab B', price: '₹2,800', report: '24 hrs', home: 'Yes' },
    { lab: 'Lab C', price: '₹4,000', report: '12 hrs', home: 'No' },
  ];

  protected roadmap = [
    { path: '/hospitals', name: 'Hospitals', text: 'Find hospitals and the services they offer' },
    { path: '/treatments', name: 'Treatments', text: 'Understand a condition and its typical costs' },
    { path: '/insurance', name: 'Insurance', text: 'Network status and coverage information' },
    { path: '/government-schemes', name: 'Government Schemes', text: 'Eligibility, coverage and where to get help' },
    { path: '/patient-rights', name: 'Patient Rights', text: 'Billing, consent, records and complaints' },
  ];
}
