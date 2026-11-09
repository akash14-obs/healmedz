import { Routes } from '@angular/router';

import { AdminPage } from './admin.page';
import { roleGuard } from './api';
import { BookPage } from './book.page';
import { BookingPage } from './booking.page';
import { ComingSoonPage, PLANNED_SECTIONS } from './coming-soon.page';
import { DiagnosticsPage } from './diagnostics.page';
import { HomePage } from './home.page';
import { LoginPage } from './login.page';
import { ProviderDashboardPage } from './provider-dashboard.page';
import { ProviderDetailPage } from './provider-detail.page';
import { SearchPage } from './search.page';

export const routes: Routes = [
  { path: '', component: HomePage, title: 'HealMedz: Compare healthcare options near you' },
  { path: 'search', component: SearchPage, title: 'Compare options | HealMedz' },
  { path: 'diagnostics', component: DiagnosticsPage, title: 'Diagnostic tests and scans | HealMedz' },
  ...Object.entries(PLANNED_SECTIONS).map(([path, section]) => ({
    path,
    component: ComingSoonPage,
    data: { section },
    title: `${section.title} | HealMedz`,
  })),
  { path: 'labs/:id', component: ProviderDetailPage, title: 'Lab details | HealMedz' },
  { path: 'book/:id', component: BookPage, title: 'Book a test | HealMedz' },
  { path: 'booking', component: BookingPage, title: 'Your booking | HealMedz' },
  { path: 'login', component: LoginPage, title: 'Sign in | HealMedz' },
  { path: 'provider', component: ProviderDashboardPage, canActivate: [roleGuard('PROVIDER')], title: 'Lab dashboard | HealMedz' },
  { path: 'admin', component: AdminPage, canActivate: [roleGuard('ADMIN')], title: 'Verification queue | HealMedz' },
  { path: '**', redirectTo: '' },
];
