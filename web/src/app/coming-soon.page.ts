import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

export interface PlannedSection { title: string; intro: string; topics: string[]; }

export const PLANNED_SECTIONS: Record<string, PlannedSection> = {
  hospitals: {
    title: 'Hospitals',
    intro: 'We are starting with diagnostic labs so the data is accurate before we add more. Hospitals come next.',
    topics: ['Hospitals near you', 'Services and specialities offered', 'Listed prices with their source and date', 'Direct contact details'],
  },
  treatments: {
    title: 'Treatments',
    intro: 'Simple, educational information about conditions and treatments. It will not diagnose or prescribe.',
    topics: ['What a condition means', 'Tests commonly used', 'Treatment options and the typical journey', 'Questions to ask a doctor', 'Possible costs'],
  },
  insurance: {
    title: 'Insurance',
    intro: 'General information to help you prepare. Actual coverage always depends on your policy terms and pre-authorization.',
    topics: ['Network and cashless status', 'Waiting periods, co-pay and sub-limits', 'Required documents', 'Links to official insurer information'],
  },
  'government-schemes': {
    title: 'Government Schemes',
    intro: 'Government healthcare information in plain language, linked to official sources and kept separate from private prices.',
    topics: ['Who is eligible', 'What is covered', 'Participating hospitals and providers', 'Package rates and required documents', 'Where to get help'],
  },
  'patient-rights': {
    title: 'Patient Rights',
    intro: 'Your rights explained simply, with directions to the right official authority when you need one.',
    topics: ['Billing transparency', 'Consent', 'Medical records and discharge documents', 'Grievances and where to raise complaints'],
  },
};

@Component({
  selector: 'app-coming-soon-page',
  imports: [RouterLink],
  template: `
    <section class="planned">
      <p class="pill">Coming later</p>
      <h1>{{ section.title }}</h1>
      <p class="lede">{{ section.intro }}</p>
      <h2>What this section will cover</h2>
      <ul>
        @for (t of section.topics; track t) { <li>{{ t }}</li> }
      </ul>
      <a class="button primary" routerLink="/diagnostics">Compare diagnostic tests now</a>
    </section>
  `,
})
export class ComingSoonPage {
  protected section = inject(ActivatedRoute).snapshot.data['section'] as PlannedSection;
}
